/**
 * Normalises what people type into E.164:
 *   "050-123-4567" (Israeli local) → +972501234567
 *   "+972 50 123 4567" / "00972…" / "972…" → +972501234567
 *   "+1 212 555 0100" → +12125550100
 * Anything else without an explicit country code is ambiguous ("(212) 555-0100" could be read as
 * Morocco +212) and returns null, so the UI asks for the "+" prefix instead of texting a stranger.
 */
export function toE164(input: string): string | null {
  let d = input.replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (!d.startsWith('+')) {
    if (d.startsWith('0')) d = '+972' + d.slice(1);
    else if (d.startsWith('972')) d = '+' + d;
    else return null;
  }
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}
