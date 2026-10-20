import { AlreadyVotedError, applyVote, BASE_TTL_S, MAX_TTL_FACTOR, newReport, shouldMerge } from './report.rules';

const T0 = 1_800_000_000_000;
const base = () =>
  newReport({ id: 'r1', type: 'police', lat: 32.08, lng: 34.78, heading: 90, reporterId: 'alice', trustScore: 0.5, now: T0 });

describe('report rules', () => {
  it('starts with confidence from trust and the base TTL', () => {
    const r = base();
    expect(r.confidence).toBe(0.5);
    expect(r.expiresAt - r.createdAt).toBe(BASE_TTL_S.police * 1000);
    expect(r.voters).toEqual(['alice']);
  });

  it('merges same type nearby in the same direction only', () => {
    const r = base();
    expect(shouldMerge(r, { type: 'police', lat: 32.0805, lng: 34.7805, heading: 100 })).toBe(true);
    expect(shouldMerge(r, { type: 'police', lat: 32.0805, lng: 34.7805, heading: null })).toBe(true);
    expect(shouldMerge(r, { type: 'police', lat: 32.0805, lng: 34.7805, heading: 270 })).toBe(false); // opposite carriageway
    expect(shouldMerge(r, { type: 'crash', lat: 32.08, lng: 34.78, heading: 90 })).toBe(false);
    expect(shouldMerge(r, { type: 'police', lat: 32.09, lng: 34.78, heading: 90 })).toBe(false); // ~1.1 km away
  });

  it('"still there" extends expiry and raises confidence, capped', () => {
    let r = base();
    const later = T0 + 40 * 60_000;
    const { report } = applyVote(r, 'bob', true, later);
    expect(report.confidence).toBe(0.6);
    expect(report.expiresAt).toBe(later + (BASE_TTL_S.police * 1000) / 2);

    r = report;
    for (let i = 0; i < 20; i++) r = applyVote(r, `u${i}`, true, T0 + 9 * 3600_000).report;
    expect(r.expiresAt).toBeLessThanOrEqual(T0 + BASE_TTL_S.police * 1000 * MAX_TTL_FACTOR);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('expires after two "not there" in a row, reset by a confirmation', () => {
    let r = base();
    r = applyVote(r, 'b', false, T0).report;
    r = applyVote(r, 'c', true, T0).report;
    const once = applyVote(r, 'd', false, T0);
    expect(once.expired).toBe(false);
    const twice = applyVote(once.report, 'e', false, T0);
    expect(twice.expired).toBe(true);
  });

  it('rejects a second vote from the same user (reporter included)', () => {
    const r = base();
    expect(() => applyVote(r, 'alice', true, T0)).toThrow(AlreadyVotedError);
    const v = applyVote(r, 'bob', true, T0).report;
    expect(() => applyVote(v, 'bob', false, T0)).toThrow(AlreadyVotedError);
  });
});
