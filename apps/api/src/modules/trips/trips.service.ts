import {
  ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { KvStore } from '../../common/kv';
import { CLOCK, Clock, KV, PROBE_SINK, TRIPS_REPO } from '../../common/tokens';
import { Metrics } from '../../observability/metrics';
import { RoutingService } from '../routing/routing.service';
import type { ProbeSink } from './probe-sink';
import type { ProbeBatchDto, ProbesAcceptedDto, TripDto, TripStartedDto, UpdateTripDto } from './trips.dto';
import type { Trip, TripsRepository } from './trips.repository';

export const PROBE_TOKEN_TTL_S = 12 * 3600;
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
    private readonly metrics: Metrics,
  ) {}

  private async routeOr404(routeId: string) {
    const r = await this.routing.get(routeId);
    if (!r) throw new NotFoundException('Route expired — request routes again');
    return r;
  }

  async start(userId: string, routeId: string): Promise<TripStartedDto> {
    const route = await this.routeOr404(routeId);
    const trip = await this.trips.create({
      userId, routeId, origin: route.origin, destination: route.destination, distanceM: route.distanceM,
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
    }
    return toDto(await this.trips.update(tripId, changes));
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
