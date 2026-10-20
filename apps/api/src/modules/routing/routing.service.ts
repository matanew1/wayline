import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { cellsAlongPath, decodePolyline, LatLng } from '../../common/geo';
import type { KvStore } from '../../common/kv';
import { KV, ROUTING_ENGINE } from '../../common/tokens';
import type { RouteOptionDto, RouteRequestDto } from './routing.dto';
import type { RoutingEngine } from './routing.engine';
import { Metrics } from '../../observability/metrics';

export const ROUTE_CACHE_TTL_S = 30 * 60;

/** What a trip needs to remember about the route it was started on. */
export interface CachedRoute {
  id: string;
  origin: LatLng;
  destination: LatLng;
  distanceM: number;
  durationS: number;
}

@Injectable()
export class RoutingService {
  constructor(
    @Inject(ROUTING_ENGINE) private readonly engine: RoutingEngine,
    @Inject(KV) private readonly kv: KvStore,
    private readonly metrics: Metrics,
  ) {}

  async plan(req: RouteRequestDto): Promise<RouteOptionDto[]> {
    let routes;
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

    return Promise.all(
      routes.map(async (r) => {
        const id = 'rt_' + randomBytes(9).toString('base64url');
        const cached: CachedRoute = { id, origin: req.origin, destination: req.destination, distanceM: r.distanceM, durationS: r.durationS };
        await this.kv.set(`route:${id}`, JSON.stringify(cached), ROUTE_CACHE_TTL_S);
        return { id, ...r, cells: cellsAlongPath(decodePolyline(r.polyline6)) };
      }),
    );
  }

  async get(routeId: string): Promise<CachedRoute | null> {
    const raw = await this.kv.get(`route:${routeId}`);
    return raw ? (JSON.parse(raw) as CachedRoute) : null;
  }
}
