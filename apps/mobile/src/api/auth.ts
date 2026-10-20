import * as SecureStore from 'expo-secure-store';
import { createWaylineClient, type TokenPair } from '@wayline/contracts';
import { config } from '@/config';

const KEY = 'wayline.tokens.v1';
/** Refresh this long before the access token expires. */
const SKEW_MS = 60_000;

interface Stored {
  accessToken: string;
  refreshToken: string;
  accessExp: number;
  userId: string;
  guest: boolean;
}

// Auth endpoints use a client without the token middleware (avoids refresh recursion).
const raw = createWaylineClient(config.apiUrl);

let current: Stored | null = null;
let loading: Promise<Stored> | null = null;

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '', buf = 0, bits = 0;
  for (const c of b64) {
    if (c === '=') break;
    buf = (buf << 6) | chars.indexOf(c);
    bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 0xff); }
  }
  return out;
}

function expOf(jwt: string): number {
  try {
    return JSON.parse(b64urlDecode(jwt.split('.')[1])).exp * 1000;
  } catch {
    return 0;
  }
}

function toStored(t: TokenPair): Stored {
  return { accessToken: t.accessToken, refreshToken: t.refreshToken, accessExp: expOf(t.accessToken), userId: t.userId, guest: t.guest };
}

async function save(s: Stored) {
  current = s;
  await SecureStore.setItemAsync(KEY, JSON.stringify(s));
  return s;
}

async function signInGuest(): Promise<Stored> {
  const { data, error } = await raw.POST('/v1/auth/guest');
  if (!data) throw new Error(`Could not start a session (${JSON.stringify(error) ?? 'network'})`);
  return save(toStored(data));
}

async function refresh(s: Stored): Promise<Stored> {
  const { data, response } = await raw.POST('/v1/auth/refresh', { body: { refreshToken: s.refreshToken } });
  if (data) return save(toStored(data));
  // Refresh token rejected (expired / user gone) → start over as a guest. Network errors bubble up.
  if (response.status === 401) return signInGuest();
  throw new Error(`Refresh failed (${response.status})`);
}

async function resolve(): Promise<Stored> {
  if (!current) {
    const json = await SecureStore.getItemAsync(KEY);
    current = json ? (JSON.parse(json) as Stored) : null;
  }
  if (!current) return signInGuest();
  if (current.accessExp - Date.now() < SKEW_MS) return refresh(current);
  return current;
}

/** Valid access token, signing in as a guest on first launch. Concurrent callers share one request. */
export async function getAccessToken(): Promise<string> {
  if (current && current.accessExp - Date.now() >= SKEW_MS) return current.accessToken;
  loading ??= resolve().finally(() => { loading = null; });
  return (await loading).accessToken;
}

export function currentUser() {
  return current ? { id: current.userId, guest: current.guest } : null;
}

/** Phone sign-in (upgrades a guest). */
export async function requestOtp(phone: string) {
  const { data, error } = await raw.POST('/v1/auth/otp', { body: { phone } });
  if (!data) throw new Error((error as { message?: string })?.message ?? 'Could not send code');
  return data;
}

export async function verifyOtp(phone: string, code: string) {
  const { data, error } = await raw.POST('/v1/auth/verify', { body: { phone, code } });
  if (!data) throw new Error((error as { message?: string })?.message ?? 'Wrong code');
  await save(toStored(data));
}

export async function signOut() {
  current = null;
  await SecureStore.deleteItemAsync(KEY);
}
