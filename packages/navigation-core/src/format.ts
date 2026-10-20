import type { Language } from './types';

/** Distance for display: "350 m", "1.2 km". */
export function formatDistance(m: number, lang: Language = 'en'): string {
  const km = lang === 'he' ? 'ק״מ' : 'km';
  const mm = lang === 'he' ? 'מ׳' : 'm';
  if (m >= 10_000) return `${Math.round(m / 1000)} ${km}`;
  if (m >= 950) return `${(m / 1000).toFixed(1)} ${km}`;
  if (m >= 100) return `${Math.round(m / 50) * 50} ${mm}`;
  return `${Math.max(10, Math.round(m / 10) * 10)} ${mm}`;
}

/** Distance as spoken: "300 meters", "1.5 kilometers". */
export function spokenDistance(m: number, lang: Language = 'en'): string {
  if (m >= 950) {
    const km = Math.round(m / 100) / 10;
    const n = Number.isInteger(km) ? String(km) : km.toFixed(1);
    if (lang === 'he') return km === 1 ? 'קילומטר' : `${n} קילומטרים`;
    return km === 1 ? '1 kilometer' : `${n} kilometers`;
  }
  const step = m >= 200 ? 100 : m >= 100 ? 50 : 10;
  const r = Math.max(10, Math.round(m / step) * step);
  return lang === 'he' ? `${r} מטר` : `${r} meters`;
}

export function formatDuration(s: number, lang: Language = 'en'): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return lang === 'he' ? `${min} דק׳` : `${min} min`;
  const h = Math.floor(min / 60), rest = min % 60;
  return lang === 'he' ? `${h} ש׳ ${rest} דק׳` : `${h} h ${rest} min`;
}

/** "14:32" in local time. */
export function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
