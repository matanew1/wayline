/**
 * Road reputation shown on the profile: a friendly reading of the trust score (0–1) that
 * weights a driver's reports. Guests are capped at 0.5, so "Trusted" needs a phone sign-in.
 */
export const LEVELS = [
  { id: 'new', min: 0 },
  { id: 'helper', min: 0.55 },
  { id: 'trusted', min: 0.7 },
  { id: 'legend', min: 0.85 },
] as const;
export type LevelId = (typeof LEVELS)[number]['id'];

export function reputation(trust: number): { level: LevelId; progress: number; next: LevelId | null } {
  let i = 0;
  while (i < LEVELS.length - 1 && trust >= LEVELS[i + 1].min) i++;
  const cur = LEVELS[i], next = LEVELS[i + 1];
  const progress = next ? Math.max(0, Math.min(1, (trust - cur.min) / (next.min - cur.min))) : 1;
  return { level: cur.id, progress: Math.round(progress * 100) / 100, next: next?.id ?? null };
}

/** Letters (any script), digits, spaces and . _ - — 2 to 24 characters after trimming. */
export const NICKNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,22}[\p{L}\p{N}.]$/u;

/** Stable default for drivers who haven't picked a name: "Driver 1234" from the user id. */
export function defaultNickname(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `Driver ${1000 + (h % 9000)}`;
}
