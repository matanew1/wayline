import type { RealtimeClientEvents, RealtimeServerEvents, Report } from '@wayline/contracts';
import { io, type Socket } from 'socket.io-client';
import { config } from '@/config';
import { getAccessToken } from './auth';

type Handlers = { upsert: (r: Report) => void; remove: (id: string) => void };

/**
 * Live report feed. Subscribes to geohash cells (along the route while driving,
 * around the driver otherwise) and re-subscribes automatically after reconnects.
 */
class Realtime {
  private socket: Socket<RealtimeServerEvents, RealtimeClientEvents> | null = null;
  private cells: string[] = [];
  private handlers: Handlers | null = null;

  connect(handlers: Handlers) {
    this.handlers = handlers;
    if (this.socket) return;
    this.socket = io(`${config.apiUrl}/rt`, {
      transports: ['websocket'],
      // fetched on every (re)connect, so an expired token is refreshed transparently
      auth: (cb) => { getAccessToken().then((token) => cb({ token }), () => cb({})); },
      reconnectionDelayMax: 10_000,
    });
    this.socket.on('connect', () => this.push());
    this.socket.on('report.upsert', (r) => this.handlers?.upsert(r));
    this.socket.on('report.remove', ({ id }) => this.handlers?.remove(id));
  }

  setCells(cells: string[]) {
    const next = [...new Set(cells)].slice(0, 400).sort();
    if (next.join() === this.cells.join()) return;
    this.cells = next;
    this.push();
  }

  private push() {
    if (this.socket?.connected && this.cells.length) this.socket.emit('subscribe', { cells: this.cells }, () => undefined);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const realtime = new Realtime();
