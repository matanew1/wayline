import { reloadAppAsync } from 'expo';
import { getLocales } from 'expo-localization';
import { useMemo } from 'react';
import { I18nManager } from 'react-native';
import type { Language } from '@wayline/navigation-core';
import { settings, useSettings, type LanguagePref } from '@/state/settings';
import { STRINGS, type StringKey } from './strings';

export type { StringKey };

function resolve(pref: LanguagePref): Language {
  if (pref !== 'system') return pref;
  const code = getLocales()[0]?.languageCode;
  return code === 'he' || code === 'iw' ? 'he' : 'en';
}

/** Current UI / guidance language. */
export const lang = (): Language => resolve(settings().language);
export const speechLocale = () => (lang() === 'he' ? 'he-IL' : 'en-US');

export function translate(l: Language, key: StringKey, vars?: Record<string, string | number>): string {
  let s = STRINGS[l][key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Outside React (toasts, speech). */
export const t = (key: StringKey, vars?: Record<string, string | number>) => translate(lang(), key, vars);

/** Inside components: re-renders when the language setting changes. */
export function useT() {
  const pref = useSettings((s) => s.language);
  const l = resolve(pref);
  // stable per language, so `t` is safe in effect dependency lists
  return useMemo(() => ({ t: (key: StringKey, vars?: Record<string, string | number>) => translate(l, key, vars), lang: l, rtl: l === 'he' }), [l]);
}

/**
 * React Native fixes layout direction at startup. If the language needs the other direction,
 * flip it and restart the JS app once. Returns true when a restart was triggered.
 */
export async function applyLayoutDirection(): Promise<boolean> {
  I18nManager.allowRTL(true);
  const wantRtl = lang() === 'he';
  if (I18nManager.isRTL === wantRtl) return false;
  I18nManager.forceRTL(wantRtl);
  try {
    await reloadAppAsync('layout direction changed');
    return true;
  } catch {
    return false; // takes effect on next launch
  }
}
