import {
  CallHandler, Controller, ExecutionContext, Get, Global, Header, Inject, Injectable, Module, NestInterceptor, NotFoundException,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';
import { finalize, type Observable } from 'rxjs';
import type { AppConfig } from '../config/config';
import { CONFIG } from '../common/tokens';

/** All app metrics on one registry (one per app instance, so tests don't collide). */
@Injectable()
export class Metrics {
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: 'wayline_http_request_duration_seconds',
    help: 'HTTP request duration by route',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });
  readonly routesPlanned = new Counter({
    name: 'wayline_routes_planned_total', help: 'Route plans by outcome', labelNames: ['outcome'], registers: [this.registry],
  });
  readonly reportsCreated = new Counter({
    name: 'wayline_reports_created_total', help: 'Reports by type; merged = confirmation of an existing one', labelNames: ['type', 'merged'], registers: [this.registry],
  });
  readonly reportVotes = new Counter({
    name: 'wayline_report_votes_total', help: 'Votes on reports', labelNames: ['still_there', 'expired'], registers: [this.registry],
  });
  readonly probeFixes = new Counter({
    name: 'wayline_probe_fixes_total', help: 'GPS probe fixes received', labelNames: ['result'], registers: [this.registry],
  });
  readonly wsConnections = new Gauge({
    name: 'wayline_realtime_connections', help: 'Open realtime sockets on this instance', registers: [this.registry],
  });
  readonly trafficLookups = new Counter({
    name: 'wayline_traffic_edge_lookups_total', help: 'Route edges priced with live vs default speeds', labelNames: ['source'], registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'wayline_' });
  }
}

@Injectable()
class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly m: Metrics) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const end = this.m.httpDuration.startTimer();
    return next.handle().pipe(
      finalize(() => {
        // route template (/v1/trips/:id), never the raw URL — keeps label cardinality bounded
        const route = req.route?.path ?? 'unmatched';
        end({ method: req.method, route, status: String(res.statusCode) });
      }),
    );
  }
}

@ApiExcludeController()
@SkipThrottle()
@Controller('metrics')
class MetricsController {
  constructor(private readonly m: Metrics, @Inject(CONFIG) private readonly config: AppConfig) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async metrics() {
    if (!this.config.metricsEnabled) throw new NotFoundException();
    return this.m.registry.metrics();
  }
}

@Global()
@Module({
  controllers: [MetricsController],
  providers: [Metrics, { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor }],
  exports: [Metrics],
})
export class MetricsModule {}
