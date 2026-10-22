import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { cellsAlongPath, decodePolyline, LatLng } from '../../common/geo';
import type { KvStore } from '../../common/kv';
import { CLOCK, Clock, KV, ROUTING_ENGINE } from '../../common/tokens';
import { Metrics } from '../../observability/metrics';
import type { AvoidOption, DepartureDto, RouteOptionDto, RouteRequestDto, Vehicle } from './routing.dto';
import { attachLanes, type EngineRoute, type LaneHint, type RoutingEngine } from './routing.engine';
import { HISTORIC_STORE, TRAFFIC_STORE } from './routing.tokens';
import { priceRoute, type RouteEdge } from './traffic.pricing';
import { hourOfWeek, type EdgeSpeed, type HistoricSpeedStore, type TrafficStore } from './traffic.store';

export const ROUTE_CACHE_TTL_S = 30 * 60;

/** What trips and ETA checks need to remember about a planned route. */
export interface CachedRoute {
  id: string;
  origin: LatLng;
  destination: LatLng;
  distanceM: number;
  /** Router's estimate without live traffic. */
  durationS: number;
  polyline6: string;
  edges: RouteEdge[] | null;
  /** The driver's preferences, reused when looking for faster routes mid-drive. */
  options?: RouteOptions;
}

export interface RouteOptions {
  avoid: AvoidOption[];
  vehicle: Vehicle;
  language: 'he' | 'en';
}

export const MAX_DEPARTURE_OFFSETS = 6;
export const MAX_DEPARTURE_OFFSET_MIN = 180;

@Injectable()
export class RoutingService {
  private readonly log = new Logger('Routing');

  constructor(
    @Inject(ROUTING_ENGINE) private readonly engine: RoutingEngine,
    @Inject(KV) private readonly kv: KvStore,
    @Inject(TRAFFIC_STORE) private readonly traffic: TrafficStore,
    @Inject(HISTORIC_STORE) private readonly historic: HistoricSpeedStore,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly metrics: Metrics,
  ) {}

  async plan(req: RouteRequestDto): Promise<RouteOptionDto[]> {
    const opts: RouteOptions = { avoid: req.avoid ?? [], vehicle: req.vehicle ?? 'car', language: req.language ?? 'en' };
    let routes: EngineRoute[];
    try {
      routes = await this.engine.route({ origin: req.origin, destination: req.destination, ...opts });
    } catch (e) {
      this.metrics.routesPlanned.inc({ outcome: 'error' });
      throw e;
    }
    this.metrics.routesPlanned.inc({ outcome: routes.length ? 'ok' : 'no_route' });
    if (routes.length === 0) throw new NotFoundException('No route found between these points');

    const options = await Promise.all(routes.map((r) => this.enrich(r, req.origin, req.destination, opts)));
    // Alternatives are ranked by traffic-adjusted time, not the router's free-flow estimate.
    return options.sort((a, b) => a.durationS - b.durationS);
  }

  /** Adds id, cells, speed limits and live-traffic pricing; caches what trips need. */
  private async enrich(r: EngineRoute, origin: LatLng, destination: LatLng, options: RouteOptions): Promise<RouteOptionDto> {
    const id = 'rt_' + randomBytes(9).toString('base64url');
    // pricing and lanes are enhancements: a route without them is still a route
    const [edges, lanes] = await Promise.all([
      this.engine.edges(r.polyline6, options.vehicle).catch((e) => {
        this.log.warn(`edges unavailable: ${(e as Error).message}`);
        return null;
      }),
      this.engine.lanes(r.polyline6, options.vehicle).catch((e): LaneHint[] => {
        this.log.warn(`lanes unavailable: ${(e as Error).message}`);
        return [];
      }),
    ]);
    const cached: CachedRoute = { id, origin, destination, distanceM: r.distanceM, durationS: r.durationS, polyline6: r.polyline6, edges, options };
    await this.kv.set(`route:${id}`, JSON.stringify(cached), ROUTE_CACHE_TTL_S);

    const shape = decodePolyline(r.polyline6);
    const base = { id, ...r, maneuvers: attachLanes(r.maneuvers, shape, lanes), cells: cellsAlongPath(shape) };
    if (!edges || edges.length === 0) return { ...base, speedLimits: [], traffic: null };

    const speeds = await this.traffic.getSpeeds(edges.map((e) => e.id));
    this.metrics.trafficLookups.inc({ source: 'live' }, speeds.size);
    this.metrics.trafficLookups.inc({ source: 'default' }, edges.length - speeds.size);
    const p = priceRoute(r, edges, speeds);
    const factor = r.durationS > 0 ? p.durationS / r.durationS : 1;
    return {
      ...base,
      durationS: p.durationS,
      maneuvers: base.maneuvers.map((m) => ({ ...m, durationS: Math.round(m.durationS * factor) })),
      speedLimits: p.speedLimits,
      traffic: { baseDurationS: p.baseDurationS, liveEdges: p.liveEdges, totalEdges: p.totalEdges, congestion: p.congestion },
    };
  }

  async get(routeId: string): Promise<CachedRoute | null> {
    const raw = await this.kv.get(`route:${routeId}`);
    return raw ? (JSON.parse(raw) as CachedRoute) : null;
  }

  /** Live remaining duration from a point on the route (by shape index). */
  async remainingFrom(route: CachedRoute, fromEdge: number) {
    if (!route.edges?.length) return null;
    const speeds = await this.traffic.getSpeeds(route.edges.slice(fromEdge).map((e) => e.id));
    return priceRoute(route, route.edges, speeds, fromEdge);
  }

  /**
   * Expected drive time when leaving now or later. Now uses live traffic; later departures use the
   * usual speed for that hour of the week (edge_speeds_hourly), falling back to the router's estimate.
   */
  async departures(route: CachedRoute, offsetsMin: number[]): Promise<DepartureDto[]> {
    const now = this.clock.now();
    const edges = route.edges ?? [];
    return Promise.all(offsetsMin.map(async (offsetMin): Promise<DepartureDto> => {
      const departAt = new Date(now + offsetMin * 60_000).toISOString();
      if (!edges.length) return { offsetMin, departAt, durationS: route.durationS, basis: 'typical' };
      const speeds = new Map<string, EdgeSpeed>();
      let basis: DepartureDto['basis'] = 'typical';
      if (offsetMin === 0) {
        const live = await this.traffic.getSpeeds(edges.map((e) => e.id));
        live.forEach((v, k) => speeds.set(k, v));
        if (live.size) basis = 'live';
      }
      // hours ahead (and edges without live data now) use the usual speed for that hour
      const ways = edges.filter((e) => e.wayId !== null && !speeds.has(e.id)).map((e) => e.wayId as number);
      const usual = await this.historic.getHourly(ways, hourOfWeek(now + offsetMin * 60_000));
      for (const e of edges) {
        const kmh = e.wayId !== null ? usual.get(e.wayId) : undefined;
        if (kmh && !speeds.has(e.id)) speeds.set(e.id, { kmh, samples: 1, updatedAt: now });
      }
      if (usual.size && basis === 'typical') basis = 'historic';
      return { offsetMin, departAt, durationS: priceRoute(route, edges, speeds).durationS, basis };
    }));
  }
}
