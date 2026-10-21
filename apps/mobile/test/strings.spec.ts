// Pure-logic tests (no React Native runtime) — see jest.config.js.
import { STRINGS } from '../src/i18n/strings';

describe('UI strings', () => {
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

  it('Hebrew covers every English key with the same placeholders', () => {
    for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
      expect(STRINGS.he[key]).toBeTruthy();
      expect([key, placeholders(STRINGS.he[key])]).toEqual([key, placeholders(STRINGS.en[key])]);
    }
  });
});
