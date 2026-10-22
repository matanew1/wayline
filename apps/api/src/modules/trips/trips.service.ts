import {
  ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { KvStore } from '../../common/kv';
import { CLOCK, Clock, KV, PROBE_SINK, TRIPS_REPO } from '../../common/tokens';
import { Metrics } from '../../observability/metrics';
import { RoutingService } from '../routing/routing.service';
import type { ProbeSink } from './probe-sink';
import { decodePolyline, nearestSegment, type LatLng } from '../../common/geo';
import { edgeAtShapeIndex } from '../routing/traffic.pricing';
import type { EtaDto, ProbeBatchDto, ProbesAcceptedDto, TripDto, TripStartedDto, UpdateTripDto } from './trips.dto';
import type { Trip, TripsRepository } from './trips.repository';
import { ShareService } from './share.service';

export const PROBE_TOKEN_TTL_S = 12 * 3600;
/** Suggest a new route only when it saves at least this much. */
export const FASTER_ROUTE_MIN_SAVING_S = 180;
/** Don't look for alternatives in the last few minutes of a drive. */
const MIN_REMAINING_FOR_ALTERNATIVES_S = 300;
/** Fixes worse than this are useless for map-matching. */
export const MAX_FIX_ACCURACY_M = 50;
const MAX_FIX_AGE_MS = 15 * 60_000;
const MAX_FIX_FUTURE_MS = 60_000;

const toDto = (t: Trip): TripDto => ({
  id: t.id, routeId: t.routeId, status: t.status, distanceM: t.distanceM,
  startedAt: t.startedAt.toISOString(), endedAt: t.endedAt?.toISOString(),
});

@Injectable()
export class TripsService {
  private readonly log = new Logger('Trips');

  constructor(
    @Inject(TRIPS_REPO) private readonly trips: TripsRepository,
    @Inject(KV) private readonly kv: KvStore,
    @Inject(PROBE_SINK) private readonly sink: ProbeSink,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly routing: RoutingService,
    private readonly shares: ShareService,
    private readonly metrics: Metrics,
  ) {}

  private async routeOr404(routeId: string) {
    const r = await this.routing.get(routeId);
    if (!r) throw new NotFoundException('Route expired — request routes again');
    return r;
  }

  async start(userId: string, routeId: string, destinationName?: string): Promise<TripStartedDto> {
    const route = await this.routeOr404(routeId);
    const trip = await this.trips.create({
      userId, routeId, origin: route.origin, destination: route.destination, distanceM: route.distanceM,
      destinationName: destinationName?.trim() || null,
    });
    const probeToken = randomBytes(24).toString('base64url');
    await this.kv.set(`probe:${probeToken}`, JSON.stringify({ sessionId: randomUUID() }), PROBE_TOKEN_TTL_S);
    await this.kv.set(`trip:probe:${trip.id}`, probeToken, PROBE_TOKEN_TTL_S);
    return { tripId: trip.id, probeToken, probeTokenExpiresInS: PROBE_TOKEN_TTL_S, startedAt: trip.startedAt.toISOString() };
  }

  async update(userId: string, tripId: string, patch: UpdateTripDto): Promise<TripDto> {
    const trip = await this.trips.findForUser(userId, tripId);
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'active') throw new ConflictException(`Trip is already ${trip.status}`);

    const changes: Parameters<TripsRepository['update']>[1] = {};
    if (patch.routeId) {
      const route = await this.routeOr404(patch.routeId);
      changes.routeId = route.id;
      changes.distanceM = route.distanceM;
    }
    if (patch.status) {
      changes.status = patch.status;
      changes.endedAt = new Date(this.clock.now());
      const token = await this.kv.get(`trip:probe:${tripId}`);
      if (token) await Promise.all([this.kv.del(`probe:${token}`), this.kv.del(`trip:probe:${tripId}`)]);
      await this.shares.end(tripId, patch.status === 'finished');
    }
    return toDto(await this.trips.update(tripId, changes));
  }

  /**
   * Live ETA for an active trip, plus a faster route if traffic makes one worthwhile.
   * The app calls this about once a minute; the position is used and discarded.
   */
  async eta(userId: string, tripId: string, pos: LatLng): Promise<EtaDto> {
    const trip = await this.trips.findForUser(userId, tripId);
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'active') throw new ConflictException(`Trip is already ${trip.status}`);
    const route = await this.routeOr404(trip.routeId);

    const shape = decodePolyline(route.polyline6);
    const near = nearestSegment(shape, pos);
    const priced = route.edges ? await this.routing.remainingFrom(route, edgeAtShapeIndex(route.edges, near.index)) : null;
    // without edges, fall back to the router's estimate scaled by the share of the shape left
    const remainingS = priced?.durationS ?? Math.round(route.durationS * (1 - near.index / Math.max(1, shape.length - 1)));
    const out: EtaDto = { remainingS, offRouteM: Math.round(near.offsetM), liveEdges: priced?.liveEdges ?? 0 };
    await this.shares.updateEta(tripId, remainingS);

    if (remainingS >= MIN_REMAINING_FOR_ALTERNATIVES_S) {
      // same preferences the driver planned with (avoid tolls, motorcycle, language)
      const [best] = await this.routing.plan({ origin: { lat: pos.lat, lng: pos.lng }, destination: route.destination, ...route.options }).catch(() => []);
      if (best && remainingS - best.durationS >= FASTER_ROUTE_MIN_SAVING_S) {
        out.fasterRoute = best;
        out.savingS = remainingS - best.durationS;
      }
    }
    return out;
  }

  async ingestProbes(batch: ProbeBatchDto): Promise<ProbesAcceptedDto> {
    const raw = await this.kv.get(`probe:${batch.probeToken}`);
    if (!raw) throw new UnauthorizedException('Probe token expired or revoked');
    const { sessionId } = JSON.parse(raw) as { sessionId: string };

    const now = this.clock.now();
    const good = batch.fixes
      .filter((f) => (f.acc ?? 0) <= MAX_FIX_ACCURACY_M && f.t >= now - MAX_FIX_AGE_MS && f.t <= now + MAX_FIX_FUTURE_MS)
      .sort((a, b) => a.t - b.t);
    if (good.length) {
      try {
        await this.sink.publish({ sessionId, receivedAt: now, fixes: good });
      } catch (e) {
        this.log.error(`probe publish failed: ${(e as Error).message}`);
        // 503 tells the app to keep the batch and retry later (probes are best-effort, never blocking guidance).
        throw new ServiceUnavailableException('Probe ingestion temporarily unavailable');
      }
    }
    this.metrics.probeFixes.inc({ result: 'accepted' }, good.length);
    this.metrics.probeFixes.inc({ result: 'dropped' }, batch.fixes.length - good.length);
    return { accepted: good.length, dropped: batch.fixes.length - good.length };
  }
}
