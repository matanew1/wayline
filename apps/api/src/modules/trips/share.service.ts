import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { KvStore } from '../../common/kv';
import { CLOCK, Clock, KV, TRIPS_REPO, USERS_REPO } from '../../common/tokens';
import { defaultNickname } from '../account/profile';
import type { UsersRepository } from '../users/users.repository';
import type { SharedTripDto } from './trips.dto';
import type { TripsRepository } from './trips.repository';

/** A share link lives as long as a long drive, and a little after arrival so the link still says "arrived". */
export const SHARE_TTL_S = 6 * 3600;
export const SHARE_AFTER_END_S = 30 * 60;

interface ShareRecord { tripId: string; userId: string }
interface LiveEta { status: SharedTripDto['status']; etaEpochMs: number; updatedAt: number; destinationName: string | null; driverName: string }

/**
 * Live ETA sharing. The link shows who is coming, where to and when — never where the driver is:
 * no position is stored, only the arrival estimate the app already computes once a minute.
 */
@Injectable()
export class ShareService {
  constructor(
    @Inject(KV) private readonly kv: KvStore,
    @Inject(TRIPS_REPO) private readonly trips: TripsRepository,
    @Inject(USERS_REPO) private readonly users: UsersRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(userId: string, tripId: string, remainingS: number | undefined, baseUrl: string) {
    const trip = await this.trips.findForUser(userId, tripId);
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'active') throw new ConflictException(`Trip is already ${trip.status}`);
    const existing = await this.kv.get(`trip:share:${tripId}`);
    const token = existing ?? randomBytes(18).toString('base64url');
    const now = this.clock.now();
    const user = await this.users.findById(userId);
    const live: LiveEta = {
      status: 'driving',
      etaEpochMs: now + Math.max(0, remainingS ?? 0) * 1000,
      updatedAt: now,
      destinationName: trip.destinationName,
      driverName: user?.displayName ?? defaultNickname(userId),
    };
    const rec: ShareRecord = { tripId, userId };
    await Promise.all([
      this.kv.set(`share:${token}`, JSON.stringify(rec), SHARE_TTL_S),
      this.kv.set(`trip:share:${tripId}`, token, SHARE_TTL_S),
      this.kv.set(`share:live:${tripId}`, JSON.stringify(live), SHARE_TTL_S),
    ]);
    return { token, url: `${baseUrl}/s/${token}`, expiresAt: new Date(now + SHARE_TTL_S * 1000).toISOString() };
  }

  async revoke(userId: string, tripId: string) {
    const trip = await this.trips.findForUser(userId, tripId);
    if (!trip) throw new NotFoundException('Trip not found');
    const token = await this.kv.get(`trip:share:${tripId}`);
    if (token) await Promise.all([this.kv.del(`share:${token}`), this.kv.del(`trip:share:${tripId}`), this.kv.del(`share:live:${tripId}`)]);
  }

  /** Called with every ETA check; a no-op unless the trip is shared. */
  async updateEta(tripId: string, remainingS: number) {
    const raw = await this.kv.get(`share:live:${tripId}`);
    if (!raw) return;
    const live = JSON.parse(raw) as LiveEta;
    const now = this.clock.now();
    await this.kv.set(`share:live:${tripId}`, JSON.stringify({ ...live, etaEpochMs: now + remainingS * 1000, updatedAt: now }), SHARE_TTL_S);
  }

  /** Trip finished or cancelled: the page says so, then the link expires. */
  async end(tripId: string, finished: boolean) {
    const [raw, token] = await Promise.all([this.kv.get(`share:live:${tripId}`), this.kv.get(`trip:share:${tripId}`)]);
    if (!raw || !token) return;
    const now = this.clock.now();
    const live = JSON.parse(raw) as LiveEta;
    const next: LiveEta = { ...live, status: finished ? 'arrived' : 'ended', etaEpochMs: finished ? now : live.etaEpochMs, updatedAt: now };
    const rec = await this.kv.get(`share:${token}`);
    await Promise.all([
      this.kv.set(`share:live:${tripId}`, JSON.stringify(next), SHARE_AFTER_END_S),
      rec ? this.kv.set(`share:${token}`, rec, SHARE_AFTER_END_S) : Promise.resolve(),
      this.kv.del(`trip:share:${tripId}`),
    ]);
  }

  async view(token: string): Promise<SharedTripDto | null> {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    const rec = await this.kv.get(`share:${token}`);
    if (!rec) return null;
    const { tripId } = JSON.parse(rec) as ShareRecord;
    const raw = await this.kv.get(`share:live:${tripId}`);
    if (!raw) return null;
    const live = JSON.parse(raw) as LiveEta;
    return {
      driverName: live.driverName, destinationName: live.destinationName, status: live.status,
      etaEpochMs: live.etaEpochMs, updatedAt: new Date(live.updatedAt).toISOString(),
    };
  }
}
