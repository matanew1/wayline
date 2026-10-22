import { defaultNickname, NICKNAME_RE, reputation } from './profile';

describe('profile', () => {
  it('maps trust to a reputation level with progress', () => {
    expect(reputation(0.3)).toEqual({ level: 'new', progress: 0.55, next: 'helper' });
    expect(reputation(0.5)).toMatchObject({ level: 'new', next: 'helper' }); // guest cap stays below Helper
    expect(reputation(0.62)).toMatchObject({ level: 'helper', next: 'trusted' });
    expect(reputation(0.7)).toEqual({ level: 'trusted', progress: 0, next: 'legend' });
    expect(reputation(1)).toEqual({ level: 'legend', progress: 1, next: null });
  });

  it('accepts friendly nicknames in any script', () => {
    for (const ok of ['Dana', 'Night Owl', 'נהג לילה', 'Road_Runner-7', 'J.R.']) expect(NICKNAME_RE.test(ok)).toBe(true);
    for (const bad of ['x', ' lead', 'trail ', '<b>', 'a'.repeat(25), 'no@email']) expect(NICKNAME_RE.test(bad)).toBe(false);
  });

  it('generates a stable default', () => {
    expect(defaultNickname('a1b2')).toBe(defaultNickname('a1b2'));
    expect(defaultNickname('a1b2')).toMatch(/^Driver \d{4}$/);
  });
});
