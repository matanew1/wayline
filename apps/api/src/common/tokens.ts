/** Dependency-injection tokens for ports (interfaces) and infrastructure handles. */
export const CONFIG = Symbol('CONFIG');
export const CLOCK = Symbol('CLOCK');
export const REDIS = Symbol('REDIS');
export const PG = Symbol('PG');
export const KV = Symbol('KV');

export const USERS_REPO = Symbol('USERS_REPO');
export const SAVED_PLACES_REPO = Symbol('SAVED_PLACES_REPO');
export const TRIPS_REPO = Symbol('TRIPS_REPO');
export const REPORT_STORE = Symbol('REPORT_STORE');
export const REPORT_LOG = Symbol('REPORT_LOG');
export const PROBE_SINK = Symbol('PROBE_SINK');
export const ROUTING_ENGINE = Symbol('ROUTING_ENGINE');
export const GEOCODER = Symbol('GEOCODER');
export const SMS_SENDER = Symbol('SMS_SENDER');

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
