import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { cellsAlongPath, decodePolyline, LatLng } from '../../common/geo';
import type { KvStore } from '../../common/kv';
import { KV, ROUTING_ENGINE } from '../../common/tokens';
import { Metrics } from '../../observability/metrics';
import type { RouteOptionDto, RouteRequestDto } from './routing.dto';
import type { EngineRoute, RoutingEngine } from './routing.engine';
import { TRAFFIC_STORE } from './routing.tokens';
import { priceRoute, type RouteEdge } from './traffic.pricing';
import type { TrafficStore } from './traffic.store';

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
}

@Injectable()
export class RoutingService {
  private readonly log = new Logger('Routing');

  constructor(
    @Inject(ROUTING_ENGINE) private readonly engine: RoutingEngine,
    @Inject(KV) private readonly kv: KvStore,
    @Inject(TRAFFIC_STORE) private readonly traffic: TrafficStore,
    private readonly metrics: Metrics,
  ) {}

  async plan(req: RouteRequestDto): Promise<RouteOptionDto[]> {
    let routes: EngineRoute[];
    try {
      routes = await this.engine.route({
        origin: req.origin,
        destination: req.destination,
        avoid: req.avoid ?? [],
        language: req.language ?? 'en',
      });
    } catch (e) {
      this.metrics.routesPlanned.inc({ outcome: 'error' });
      throw e;
    }
    this.metrics.routesPlanned.inc({ outcome: routes.length ? 'ok' : 'no_route' });
    if (routes.length === 0) throw new NotFoundException('No route found between these points');

    const options = await Promise.all(routes.map((r) => this.enrich(r, req.origin, req.destination)));
    // Alternatives are ranked by traffic-adjusted time, not the router's free-flow estimate.
    return options.sort((a, b) => a.durationS - b.durationS);
  }

  /** Adds id, cells, speed limits and live-traffic pricing; caches what trips need. */
  private async enrich(r: EngineRoute, origin: LatLng, destination: LatLng): Promise<RouteOptionDto> {
    const id = 'rt_' + randomBytes(9).toString('base64url');
    const edges = await this.engine.edges(r.polyline6).catch((e) => {
      // pricing is an enhancement: a route without it is still a route
      this.log.warn(`edges unavailable: ${(e as Error).message}`);
      return null;
    });
    const cached: CachedRoute = { id, origin, destination, distanceM: r.distanceM, durationS: r.durationS, polyline6: r.polyline6, edges };
    await this.kv.set(`route:${id}`, JSON.stringify(cached), ROUTE_CACHE_TTL_S);

    const base = { id, ...r, cells: cellsAlongPath(decodePolyline(r.polyline6)) };
    if (!edges || edges.length === 0) return { ...base, speedLimits: [], traffic: null };

    const speeds = await this.traffic.getSpeeds(edges.map((e) => e.id));
    this.metrics.trafficLookups.inc({ source: 'live' }, speeds.size);
    this.metrics.trafficLookups.inc({ source: 'default' }, edges.length - speeds.size);
    const p = priceRoute(r, edges, speeds);
    const factor = r.durationS > 0 ? p.durationS / r.durationS : 1;
    return {
      ...base,
      durationS: p.durationS,
      maneuvers: r.maneuvers.map((m) => ({ ...m, durationS: Math.round(m.durationS * factor) })),
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
}
