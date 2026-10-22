import type { SharedTripDto } from './trips.dto';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const T = {
  en: {
    title: 'Wayline · live ETA', onTheWay: (n: string) => `${n} is on the way`, to: (d: string) => `to ${d}`,
    arrives: 'Arrives', minLeft: (m: number) => (m <= 1 ? 'about a minute away' : `${m} min away`),
    arrived: (n: string) => `${n} has arrived`, ended: (n: string) => `${n} ended the drive`,
    gone: 'This link has expired', goneBody: 'Live ETA links stop working shortly after the drive ends.',
    updated: (m: number) => (m < 1 ? 'Updated just now' : `Updated ${m} min ago`), privacy: 'Wayline shares the arrival time only — never the driver’s location.',
  },
  he: {
    title: 'Wayline · זמן הגעה', onTheWay: (n: string) => `${n} בדרך`, to: (d: string) => `אל ${d}`,
    arrives: 'הגעה משוערת', minLeft: (m: number) => (m <= 1 ? 'עוד כדקה' : `עוד ${m} דק׳`),
    arrived: (n: string) => `${n} הגיע/ה`, ended: (n: string) => `${n} סיים/ה את הנסיעה`,
    gone: 'הקישור פג תוקף', goneBody: 'קישורי זמן הגעה מפסיקים לעבוד זמן קצר אחרי סוף הנסיעה.',
    updated: (m: number) => (m < 1 ? 'עודכן עכשיו' : `עודכן לפני ${m} דק׳`), privacy: 'Wayline משתפת רק את זמן ההגעה — לעולם לא את מיקום הנהג/ת.',
  },
};

/** Server-rendered, no script: refreshes itself every 30 s while the drive is on. */
export function sharePage(trip: SharedTripDto | null, lang: 'en' | 'he', now: number, tz = 'Asia/Jerusalem'): string {
  const t = T[lang];
  const clock = (ms: number) => new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(ms);
  let body: string;
  if (!trip) {
    body = `<h1>${t.gone}</h1><p class="sub">${t.goneBody}</p>`;
  } else {
    const name = esc(trip.driverName);
    const dest = trip.destinationName ? `<p class="sub">${esc(t.to(trip.destinationName))}</p>` : '';
    const ago = Math.max(0, Math.floor((now - Date.parse(trip.updatedAt)) / 60_000));
    if (trip.status === 'driving') {
      const mins = Math.max(0, Math.round((trip.etaEpochMs - now) / 60_000));
      body = `<h1>${t.onTheWay(name)}</h1>${dest}
<div class="eta"><span class="label">${t.arrives}</span><span class="big">${clock(trip.etaEpochMs)}</span><span class="sub">${t.minLeft(mins)}</span></div>
<p class="small">${t.updated(ago)}</p>`;
    } else {
      body = `<h1>${trip.status === 'arrived' ? t.arrived(name) : t.ended(name)}</h1>${dest}<p class="small">${t.updated(ago)}</p>`;
    }
  }
  const refresh = trip?.status === 'driving' ? '<meta http-equiv="refresh" content="30">' : '';
  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${refresh}
<title>${t.title}</title>
<style>
:root{color-scheme:light dark;--ink:#1B1838;--sub:#5A5675;--bg:#F6F5F9;--card:#FFFFFF;--line:#E4E0EE;--pri:#5B3DF5}
@media (prefers-color-scheme:dark){:root{--ink:#F4F2FF;--sub:#BDB8DB;--bg:#17152B;--card:#26223F;--line:#3A3560;--pri:#8B76FF}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:440px;margin:0 auto;padding:40px 20px;display:flex;flex-direction:column;gap:16px}
.card{background:var(--card);border:1.5px solid var(--line);border-radius:24px;padding:24px;box-shadow:0 8px 24px rgba(27,24,56,.08)}
h1{margin:0;font-size:26px;letter-spacing:-.02em}
.sub{margin:4px 0 0;color:var(--sub);font-weight:600}
.eta{margin-top:20px;display:flex;flex-direction:column}
.label{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--sub)}
.big{font-size:56px;font-weight:800;letter-spacing:-.03em;color:var(--pri);line-height:1.05;font-variant-numeric:tabular-nums}
.small{margin:16px 0 0;font-size:14px;color:var(--sub)}
footer{font-size:13px;color:var(--sub);text-align:center}
</style>
</head>
<body><main><div class="card">${body}</div><footer>${t.privacy}</footer></main></body>
</html>`;
}
