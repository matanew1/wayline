export interface LatLng {
  lat: number;
  lng: number;
}

/** One GPS reading. speed in m/s, heading in degrees (0 = north), acc in metres. */
export interface Fix {
  t: number;
  lat: number;
  lng: number;
  speed?: number | null;
  heading?: number | null;
  acc?: number | null;
}

/** Structurally identical to the API's ManeuverDto. */
export interface RouteManeuver {
  kind: string;
  instruction: string;
  streetNames: string[];
  distanceM: number;
  durationS: number;
  beginShapeIndex: number;
  /** Lanes before this maneuver, left to right; `valid` lanes can be used for it. */
  lanes?: Lane[];
}

export interface Lane {
  indications: string[];
  valid: boolean;
}

export interface SpeedLimitSpan {
  /** metres along the route (in the route's distanceM scale) */
  fromM: number;
  toM: number;
  kmh: number;
}

/** Structurally compatible with the API's RouteOptionDto. */
export interface NavRoute {
  id: string;
  polyline6: string;
  durationS: number;
  distanceM: number;
  maneuvers: RouteManeuver[];
  flags: string[];
  cells: string[];
  speedLimits?: SpeedLimitSpan[];
}

/** Anything with a position — reports from the API fit. */
export interface ReportLike {
  id: string;
  type: string;
  lat: number;
  lng: number;
  heading: number | null;
}

export type Language = 'en' | 'he';
