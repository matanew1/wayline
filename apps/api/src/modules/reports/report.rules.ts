import { haversineM, headingDiff } from '../../common/geo';

export const REPORT_TYPES = ['traffic', 'police', 'crash', 'hazard', 'closure', 'camera'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** How long a report lives without confirmations. */
export const BASE_TTL_S: Record<ReportType, number> = {
  traffic: 30 * 60,
  police: 45 * 60,
  crash: 60 * 60,
  hazard: 90 * 60,
  closure: 24 * 3600,
  camera: 30 * 24 * 3600,
};
/** A report can never live longer than this multiple of its base TTL, however many confirmations. */
export const MAX_TTL_FACTOR = 3;
export const MERGE_RADIUS_M = 150;
export const MERGE_HEADING_DEG = 45;
export const NOT_THERE_TO_EXPIRE = 2;
export const REPORTS_PER_HOUR = 10;

export interface Report {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  /** Direction of travel of the reporter; null when unknown. */
  heading: number | null;
  reporterId: string;
  confidence: number;
  createdAt: number;
  expiresAt: number;
  notThereStreak: number;
  /** Users who already voted (the reporter counts as one). */
  voters: string[];
}

export class AlreadyVotedError extends Error {}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function initialConfidence(trustScore: number): number {
  return round2(clamp01(0.3 + 0.4 * trustScore));
}

export function newReport(p: {
  id: string; type: ReportType; lat: number; lng: number; heading: number | null; reporterId: string; trustScore: number; now: number;
}): Report {
  return {
    id: p.id, type: p.type, lat: p.lat, lng: p.lng, heading: p.heading, reporterId: p.reporterId,
    confidence: initialConfidence(p.trustScore),
    createdAt: p.now,
    expiresAt: p.now + BASE_TTL_S[p.type] * 1000,
    notThereStreak: 0,
    voters: [p.reporterId],
  };
}

/** Same type, close by, and (when both have one) roughly the same direction of travel. */
export function shouldMerge(existing: Report, incoming: { type: ReportType; lat: number; lng: number; heading: number | null }): boolean {
  if (existing.type !== incoming.type) return false;
  if (haversineM(existing, incoming) > MERGE_RADIUS_M) return false;
  if (existing.heading !== null && incoming.heading !== null && headingDiff(existing.heading, incoming.heading) > MERGE_HEADING_DEG) {
    return false; // e.g. police on the opposite carriageway
  }
  return true;
}

export interface VoteOutcome {
  report: Report;
  expired: boolean;
}

/**
 * "Still there" raises confidence and pushes expiry out by half a base TTL (capped).
 * Two "not there" votes in a row expire the report.
 */
export function applyVote(r: Report, userId: string, stillThere: boolean, now: number): VoteOutcome {
  if (r.voters.includes(userId)) throw new AlreadyVotedError();
  const ttlMs = BASE_TTL_S[r.type] * 1000;
  const next: Report = { ...r, voters: [...r.voters, userId] };
  if (stillThere) {
    next.notThereStreak = 0;
    next.confidence = round2(clamp01(r.confidence + 0.1));
    const cap = r.createdAt + ttlMs * MAX_TTL_FACTOR;
    next.expiresAt = Math.min(cap, Math.max(r.expiresAt, now + ttlMs / 2));
  } else {
    next.notThereStreak = r.notThereStreak + 1;
    next.confidence = round2(clamp01(r.confidence - 0.25));
  }
  const expired = next.notThereStreak >= NOT_THERE_TO_EXPIRE || next.expiresAt <= now;
  return { report: next, expired };
}
