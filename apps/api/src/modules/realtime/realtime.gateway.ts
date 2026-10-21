import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import type { Subscription } from 'rxjs';
import type { Namespace, Socket } from 'socket.io';
import { verifyAccessToken } from '../../common/auth';
import { geohashEncode, GEOHASH_RE } from '../../common/geo';
import { Metrics } from '../../observability/metrics';
import { ReportEvents } from '../reports/report.events';

export const CELL_PRECISION = 6;
export const MAX_CELLS = 400;
const room = (cell: string) => `cell:${cell}`;

/**
 * Socket.IO namespace /rt
 *   auth:      io(url + '/rt', { auth: { token: accessToken } })
 *   client →   'subscribe' { cells: string[] }   geohash-6 cells (RouteOption.cells), replaces previous set
 *   server →   'report.upsert' ReportDto  |  'report.remove' { id }
 */
@WebSocketGateway({ namespace: '/rt', cors: { origin: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly log = new Logger('Realtime');
  private sub?: Subscription;

  @WebSocketServer() server: Namespace;

  constructor(private readonly jwt: JwtService, private readonly events: ReportEvents, private readonly metrics: Metrics) {}

  afterInit() {
    this.sub = this.events.stream.subscribe((e) => {
      const target = this.server.to(room(geohashEncode(e.report.lat, e.report.lng, CELL_PRECISION)));
      if (e.kind === 'upsert') target.emit('report.upsert', e.report);
      else target.emit('report.remove', { id: e.report.id });
    });
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
  }

  async handleConnection(client: Socket) {
    try {
      client.data.user = await verifyAccessToken(this.jwt, client.handshake.auth?.token);
      client.data.counted = true;
      this.metrics.wsConnections.inc();
    } catch {
      client.emit('error', { message: 'unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.counted) this.metrics.wsConnections.dec();
  }

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { cells?: unknown }) {
    const cells = Array.isArray(body?.cells) ? body.cells : null;
    if (!cells || cells.length > MAX_CELLS || !cells.every((c) => typeof c === 'string' && c.length === CELL_PRECISION && GEOHASH_RE.test(c))) {
      return { ok: false, error: `cells must be up to ${MAX_CELLS} geohash-${CELL_PRECISION} strings` };
    }
    const wanted = new Set(cells.map(room));
    for (const r of client.rooms) if (r.startsWith('cell:') && !wanted.has(r)) client.leave(r);
    await client.join([...wanted]);
    return { ok: true, cells: wanted.size };
  }
}
