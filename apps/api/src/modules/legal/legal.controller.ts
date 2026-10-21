import { Controller, Get, Header, Module, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DELETE_ACCOUNT, hasPlaceholders, type LegalLang, type LegalPage, PRIVACY } from './legal.content';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderLegal(page: LegalPage, lang: LegalLang, path: string): string {
  const rtl = lang === 'he';
  const other = rtl ? { lang: 'en', label: 'English' } : { lang: 'he', label: 'עברית' };
  const warn = hasPlaceholders(page)
    ? `<p class="warn">${rtl ? 'טיוטה: יש למלא את הפרטים בסוגריים לפני ההשקה.' : 'Draft: fill in the bracketed details before launch.'}</p>`
    : '';
  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<style>
:root{--ink:#0F172A;--sub:#475569;--line:#E2E8F0;--accent:#2563EB;--bg:#FFFFFF}
@media (prefers-color-scheme:dark){:root{--ink:#F1F5F9;--sub:#CBD5E1;--line:#334155;--accent:#93C5FD;--bg:#0F172A}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:28px;line-height:1.2;margin:0 0 4px}h2{font-size:19px;margin:28px 0 8px}
p,li{color:var(--sub)}ul{padding-inline-start:20px}.meta{font-size:14px;color:var(--sub)}
a{color:var(--accent)}.warn{background:#FEF3C7;color:#92400E;padding:10px 12px;border-radius:8px}
</style>
</head>
<body><main>
<p class="meta"><a href="${path}?lang=${other.lang}">${other.label}</a></p>
<h1>${esc(page.title)}</h1>
<p class="meta">${rtl ? 'עודכן' : 'Updated'}: ${page.updated}</p>
${warn}
${page.sections.map((s) => `<h2>${esc(s.h)}</h2>${s.p.length > 1 ? `<ul>${s.p.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p>${esc(s.p[0])}</p>`}`).join('\n')}
</main></body></html>`;
}

const pick = (lang?: string): LegalLang => (lang === 'he' ? 'he' : 'en');

/** Public, unauthenticated pages linked from the store listings and the app. */
@ApiExcludeController()
@SkipThrottle()
@Controller()
export class LegalController {
  @Get('privacy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  privacy(@Query('lang') lang?: string) {
    const l = pick(lang);
    return renderLegal(PRIVACY[l], l, '/privacy');
  }

  @Get('delete-account')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  deleteAccount(@Query('lang') lang?: string) {
    const l = pick(lang);
    return renderLegal(DELETE_ACCOUNT[l], l, '/delete-account');
  }
}

@Module({ controllers: [LegalController] })
export class LegalModule {}
