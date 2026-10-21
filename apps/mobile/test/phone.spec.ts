import { toE164 } from '../src/lib/phone';

describe('toE164', () => {
  it.each([
    ['050-123-4567', '+972501234567'],
    ['+972 50 123 4567', '+972501234567'],
    ['972501234567', '+972501234567'],
    ['00972501234567', '+972501234567'],
    ['(212) 555-0100', null], // no country code and not an Israeli local number
    ['+1 212 555 0100', '+12125550100'],
    ['abc', null],
  ])('%s → %s', (input, out) => expect(toE164(input)).toBe(out));
});
