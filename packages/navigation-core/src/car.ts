import { formatDistance } from './format';
import type { SessionSnapshot } from './session';
import type { Language, ReportLike, RouteManeuver } from './types';

/**
 * What a car head unit (CarPlay / Android Auto) shows, derived from a NavigationSession snapshot.
 * Platform adapters in the app turn this into the native template types.
 */
export type CarIcon = 'right' | 'left' | 'straight' | 'uturn' | 'roundabout' | 'flag';

export interface CarManeuver {
  kind: string;
  icon: CarIcon;
  instruction: string;
  /** Short form for small displays / the instrument cluster. */
  shortInstruction: string;
  road: string | null;
  distanceM: number;
  distanceText: string;
}

export interface CarGuidance {
  state: 'navigating' | 'rerouting' | 'arrived';
  maneuver: CarManeuver | null;
  then: CarManeuver | null;
  remainingDistanceM: number;
  remainingS: number;
  etaEpochMs: number;
  speedLimitKmh: number | null;
  alert: { type: string; distanceM: number } | null;
}

export function carIcon(kind: string | undefined): CarIcon {
  switch (kind) {
    case 'right': case 'slight_right': case 'sharp_right': case 'keep_right': case 'exit': return 'right';
    case 'left': case 'slight_left': case 'sharp_left': case 'keep_left': return 'left';
    case 'uturn': return 'uturn';
    case 'roundabout': return 'roundabout';
    case 'arrive': return 'flag';
    default: return 'straight';
  }
}

const strip = (s: string) => s.replace(/\.\s*$/, '');

function maneuver(m: RouteManeuver, distanceM: number, lang: Language): CarManeuver {
  const road = m.streetNames[0] ?? null;
  return {
    kind: m.kind,
    icon: carIcon(m.kind),
    instruction: strip(m.instruction),
    shortInstruction: road ?? strip(m.instruction),
    road,
    distanceM: Math.round(distanceM),
    distanceText: formatDistance(distanceM, lang),
  };
}

export function carGuidance<R extends ReportLike>(s: SessionSnapshot<R>, lang: Language = 'en', now = Date.now()): CarGuidance {
  const p = s.progress;
  const next = p?.nextManeuver ?? s.route.maneuvers[1] ?? s.route.maneuvers[0] ?? null;
  const remainingS = s.remainingS ?? p?.durationRemainingS ?? s.route.durationS;
  return {
    state: s.phase,
    maneuver: next ? maneuver(next, p?.distanceToManeuverM ?? next.distanceM, lang) : null,
    then: p?.thenManeuver ? maneuver(p.thenManeuver, p.thenManeuver.distanceM, lang) : null,
    remainingDistanceM: Math.round(p?.distanceRemainingM ?? s.route.distanceM),
    remainingS: Math.round(remainingS),
    etaEpochMs: s.etaEpochMs ?? now + remainingS * 1000,
    speedLimitKmh: p?.speedLimitKmh ?? null,
    alert: s.alert ? { type: s.alert.report.type, distanceM: Math.round(s.alert.distanceAheadM) } : null,
  };
}

/** CarPlay `CPManeuverType` values (react-native-carplay `ManeuverType`). */
export function carPlayManeuverType(kind: string): number {
  const T = { NoTurn: 0, LeftTurn: 1, RightTurn: 2, StraightAhead: 3, UTurn: 4, FollowRoad: 5, EnterRoundabout: 6, OffRamp: 8, OnRamp: 9, StartRoute: 11, ArriveAtDestination: 12, KeepLeft: 13, KeepRight: 14, EnterFerry: 15, SharpLeftTurn: 47, SharpRightTurn: 48, SlightLeftTurn: 49, SlightRightTurn: 50 };
  switch (kind) {
    case 'depart': return T.StartRoute;
    case 'arrive': return T.ArriveAtDestination;
    case 'right': return T.RightTurn;
    case 'left': return T.LeftTurn;
    case 'slight_right': return T.SlightRightTurn;
    case 'slight_left': return T.SlightLeftTurn;
    case 'sharp_right': return T.SharpRightTurn;
    case 'sharp_left': return T.SharpLeftTurn;
    case 'keep_right': return T.KeepRight;
    case 'keep_left': return T.KeepLeft;
    case 'uturn': return T.UTurn;
    case 'roundabout': return T.EnterRoundabout;
    case 'ramp': return T.OnRamp;
    case 'exit': return T.OffRamp;
    case 'ferry': return T.EnterFerry;
    case 'continue': case 'merge': return T.StraightAhead;
    default: return T.FollowRoad;
  }
}

/** Android for Cars `Maneuver.TYPE_*` values (react-native-carplay `AndroidAutoManeuverType`). */
export function androidAutoManeuverType(kind: string): number {
  const T = {
    UNKNOWN: 0, DEPART: 1, NAME_CHANGE: 2, KEEP_LEFT: 3, KEEP_RIGHT: 4, SLIGHT_LEFT: 5, SLIGHT_RIGHT: 6,
    LEFT: 7, RIGHT: 8, SHARP_LEFT: 9, SHARP_RIGHT: 10, U_TURN_LEFT: 11, ON_RAMP_NORMAL_RIGHT: 16,
    OFF_RAMP_NORMAL_RIGHT: 24, MERGE_SIDE_UNSPECIFIED: 29, STRAIGHT: 36, FERRY_BOAT: 37, DESTINATION: 39,
    ROUNDABOUT_ENTER_CCW: 45,
  };
  switch (kind) {
    case 'depart': return T.DEPART;
    case 'arrive': return T.DESTINATION;
    case 'right': return T.RIGHT;
    case 'left': return T.LEFT;
    case 'slight_right': return T.SLIGHT_RIGHT;
    case 'slight_left': return T.SLIGHT_LEFT;
    case 'sharp_right': return T.SHARP_RIGHT;
    case 'sharp_left': return T.SHARP_LEFT;
    case 'keep_right': return T.KEEP_RIGHT;
    case 'keep_left': return T.KEEP_LEFT;
    case 'uturn': return T.U_TURN_LEFT; // right-hand traffic (Israel): U-turns go left
    case 'ramp': return T.ON_RAMP_NORMAL_RIGHT;
    case 'exit': return T.OFF_RAMP_NORMAL_RIGHT;
    case 'merge': return T.MERGE_SIDE_UNSPECIFIED;
    case 'ferry': return T.FERRY_BOAT;
    case 'continue': return T.STRAIGHT;
    // right-hand traffic: counter-clockwise; "enter" needs no exit number (Valhalla doesn't give one per maneuver here)
    case 'roundabout': return T.ROUNDABOUT_ENTER_CCW;
    default: return T.UNKNOWN;
  }
}
