import { haversineM } from './geo';
import type { Fix, LatLng } from './types';

export type SendResult = 'ok' | 'retry' | 'drop';

export interface ProbeBufferOptions {
  origin: LatLng;
  destination: LatLng;
  /** Privacy: drop fixes within this distance of the trip's start and end. */
  trimM: number;
  flushEveryMs: number;
  maxBatch: number;
  /** Oldest fixes are discarded beyond this (e.g. long offline stretch). */
  maxBuffered: number;
  maxAccuracyM: number;
  maxBackoffMs: number;
  send: (fixes: Fix[]) => Promise<SendResult>;
  now: () => number;
}

/**
 * Collects GPS fixes for the live-traffic pipeline and uploads them in batches.
 * - trims the first and last `trimM` metres of the trip on the device, so home/work never leave the phone
 * - retries with exponential backoff on 'retry' (503 / network), stops for good on 'drop' (token revoked)
 */
export class ProbeBuffer {
  private readonly o: ProbeBufferOptions;
  private buf: Fix[] = [];
  private leftOrigin = false;
  private lastFlush: number;
  private backoffMs = 0;
  private nextAttempt = 0;
  private inFlight: Promise<void> | null = null;
  private stopped = false;
  sent = 0;

  constructor(opts: Partial<ProbeBufferOptions> & Pick<ProbeBufferOptions, 'origin' | 'destination' | 'send' | 'now'>) {
    this.o = { trimM: 300, flushEveryMs: 10_000, maxBatch: 600, maxBuffered: 1800, maxAccuracyM: 50, maxBackoffMs: 120_000, ...opts };
    this.lastFlush = this.o.now();
  }

  get size() {
    return this.buf.length;
  }

  get isStopped() {
    return this.stopped;
  }

  add(fix: Fix) {
    if (this.stopped) return;
    if ((fix.acc ?? 0) > this.o.maxAccuracyM) return;
    if (!this.leftOrigin) {
      if (haversineM(fix, this.o.origin) < this.o.trimM) return;
      this.leftOrigin = true;
    }
    if (haversineM(fix, this.o.destination) < this.o.trimM) return;
    this.buf.push(fix);
    if (this.buf.length > this.o.maxBuffered) this.buf.splice(0, this.buf.length - this.o.maxBuffered);
  }

  /** Call on every fix; uploads when due. Never throws. */
  maybeFlush(): Promise<void> {
    const now = this.o.now();
    if (this.stopped || this.inFlight || this.buf.length === 0) return this.inFlight ?? Promise.resolve();
    if (now - this.lastFlush < this.o.flushEveryMs || now < this.nextAttempt) return Promise.resolve();
    return this.flush();
  }

  /** Upload now regardless of timing (e.g. trip ended). */
  flush(): Promise<void> {
    if (this.stopped || this.buf.length === 0) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    const batch = this.buf.slice(0, this.o.maxBatch);
    this.inFlight = (async () => {
      let res: SendResult;
      try {
        res = await this.o.send(batch);
      } catch {
        res = 'retry';
      }
      const now = this.o.now();
      this.lastFlush = now;
      if (res === 'ok') {
        this.buf.splice(0, batch.length);
        this.sent += batch.length;
        this.backoffMs = 0;
        this.nextAttempt = 0;
      } else if (res === 'retry') {
        this.backoffMs = Math.min(this.o.maxBackoffMs, this.backoffMs ? this.backoffMs * 2 : 5_000);
        this.nextAttempt = now + this.backoffMs;
      } else {
        this.stopped = true;
        this.buf = [];
      }
    })().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
}
