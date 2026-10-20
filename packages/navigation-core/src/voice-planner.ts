import { spokenDistance } from './format';
import type { Progress } from './route-tracker';
import type { Language, RouteManeuver } from './types';

export type VoiceStage = 'far' | 'near' | 'now';

const PHRASES = {
  en: {
    in: (d: string, what: string) => `In ${d}, ${lowerFirst(what)}`,
    then: (what: string) => `then ${lowerFirst(what)}`,
    arrived: 'You have arrived at your destination',
    arriveIn: (d: string) => `Your destination is in ${d}`,
    rerouting: 'Recalculating route',
  },
  he: {
    in: (d: string, what: string) => `בעוד ${d}, ${what}`,
    then: (what: string) => `ואז ${what}`,
    arrived: 'הגעת ליעד',
    arriveIn: (d: string) => `היעד בעוד ${d}`,
    rerouting: 'מחשב מסלול מחדש',
  },
} as const;

function lowerFirst(s: string) {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s;
}
function stripDot(s: string) {
  return s.replace(/\.\s*$/, '');
}

export function phrase(lang: Language) {
  return PHRASES[lang];
}

/** Announcement distances for a given speed (m/s). */
export function thresholds(speedMs: number) {
  const far = speedMs > 22 ? 2000 : speedMs > 14 ? 1000 : 400;
  const near = Math.max(80, speedMs * 10); // ~10 s before
  const now = Math.max(20, speedMs * 3); // ~3 s before
  return { far, near, now };
}

/**
 * Decides when to speak, once per maneuver per stage:
 *   far  — "In 1 kilometer, turn right onto Herzl St"   (only if the stretch is long enough)
 *   near — "In 200 meters, turn right onto Herzl St"
 *   now  — "Turn right onto Herzl St" (+ "then …" if the next one follows closely)
 */
export class VoicePlanner {
  private readonly spoken = new Map<number, Set<VoiceStage>>();
  private arrivedSpoken = false;

  constructor(private readonly maneuvers: RouteManeuver[], private readonly lang: Language = 'en') {}

  /** Text for the departure maneuver; speak it when guidance starts. */
  start(): string | null {
    return this.maneuvers[0] ? stripDot(this.maneuvers[0].instruction) : null;
  }

  update(p: Progress, speedMs: number, distanceBetween?: (i: number) => number): string | null {
    const ph = PHRASES[this.lang];
    if (p.arrived) {
      if (this.arrivedSpoken) return null;
      this.arrivedSpoken = true;
      return ph.arrived;
    }
    const i = p.nextManeuverIndex;
    const m = p.nextManeuver;
    if (!m || i === 0) return null;
    const done = this.spoken.get(i) ?? new Set<VoiceStage>();
    this.spoken.set(i, done);

    const th = thresholds(speedMs);
    const d = p.distanceToManeuverM;
    const what = stripDot(m.instruction);

    let stage: VoiceStage | null = null;
    if (d <= th.now) stage = 'now';
    else if (d <= th.near) stage = 'near';
    else if (d <= th.far && d > th.near * 2) stage = 'far';
    if (!stage || done.has(stage)) return null;

    // Mark this and all coarser stages as done so we never go backwards.
    const order: VoiceStage[] = ['far', 'near', 'now'];
    for (const s of order.slice(0, order.indexOf(stage) + 1)) done.add(s);

    if (m.kind === 'arrive') {
      // the arrival itself is announced once, by the `arrived` branch above
      return stage === 'now' ? null : ph.arriveIn(spokenDistance(d, this.lang));
    }
    if (stage === 'now') {
      const then = p.thenManeuver;
      const gap = then && distanceBetween ? distanceBetween(i) : Infinity;
      if (then && m.kind !== 'arrive' && gap < th.near) return `${what}, ${ph.then(stripDot(then.instruction))}`;
      return what;
    }
    return ph.in(spokenDistance(d, this.lang), what);
  }
}
