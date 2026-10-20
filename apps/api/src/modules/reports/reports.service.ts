import {
  ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../../common/auth';
import type { KvStore } from '../../common/kv';
import { CLOCK, Clock, KV, REPORT_LOG, REPORT_STORE, USERS_REPO } from '../../common/tokens';
import type { UsersRepository } from '../users/users.repository';
import { Metrics } from '../../observability/metrics';
import { ReportEvents } from './report.events';
import {
  AlreadyVotedError, applyVote, MERGE_RADIUS_M, newReport, Report, REPORTS_PER_HOUR, shouldMerge, TRUST_ON_CONFIRM, TRUST_ON_REJECT,
} from './report.rules';
import type { ActiveReportStore, ReportLog, VoteRecord } from './report.store';
import type { CreateReportDto, ReportCreatedDto, ReportDto, VoteResultDto } from './reports.dto';

export const toReportDto = (r: Report): ReportDto => ({
  id: r.id, type: r.type, lat: r.lat, lng: r.lng, heading: r.heading, confidence: r.confidence,
  createdAt: new Date(r.createdAt).toISOString(), expiresAt: new Date(r.expiresAt).toISOString(),
});

@Injectable()
export class ReportsService implements OnModuleDestroy {
  private readonly log = new Logger('Reports');

  constructor(
    @Inject(REPORT_STORE) private readonly store: ActiveReportStore,
    @Inject(REPORT_LOG) private readonly history: ReportLog,
    @Inject(KV) private readonly kv: KvStore,
    @Inject(USERS_REPO) private readonly users: UsersRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: ReportEvents,
    private readonly metrics: Metrics,
  ) {}

  private readonly queues = new Map<string, Promise<void>>();

  /**
   * History writes run off the request path (they must never fail or slow the driver's request),
   * but in order per report, so "created → voted → expired" reaches Postgres in that order.
   */
  private persist(r: Report, status: 'active' | 'expired', vote?: VoteRecord) {
    const prev = this.queues.get(r.id) ?? Promise.resolve();
    const next = prev
      .then(() => this.history.record(r, status, vote))
      .catch((e) => this.log.error(`history write failed for ${r.id}: ${(e as Error).message}`));
    this.queues.set(r.id, next);
    void next.finally(() => {
      if (this.queues.get(r.id) === next) this.queues.delete(r.id);
    });
  }

  /** Reporter reputation; off the request path like history writes. */
  private trust(userId: string, delta: number) {
    const p = this.users.adjustTrust(userId, delta).then(
      () => undefined,
      (e) => this.log.error(`trust update failed for ${userId}: ${(e as Error).message}`),
    );
    this.pendingTrust.add(p);
    void p.finally(() => this.pendingTrust.delete(p));
  }
  private readonly pendingTrust = new Set<Promise<void>>();

  /** Resolves when all queued history writes are done (used on shutdown and in tests). */
  async flush() {
    await Promise.all([...this.queues.values(), ...this.pendingTrust]);
  }

  // Runs before InfraModule closes the pool (onApplicationShutdown).
  async onModuleDestroy() {
    await this.flush();
  }

  async create(user: AuthUser, dto: CreateReportDto): Promise<ReportCreatedDto> {
    const idemKey = `report:client:${user.id}:${dto.clientId}`;
    const previous = await this.kv.get(idemKey);
    if (previous) {
      const r = await this.store.get(previous);
      if (r) return { id: r.id, merged: r.reporterId !== user.id, report: toReportDto(r) };
    }

    if ((await this.kv.incr(`report:rate:${user.id}`, 3600)) > REPORTS_PER_HOUR) {
      throw new HttpException('Too many reports — try again later', HttpStatus.TOO_MANY_REQUESTS);
    }

    const now = this.clock.now();
    const incoming = { type: dto.type, lat: dto.lat, lng: dto.lng, heading: dto.heading ?? null };
    const near = await this.store.findNear(dto.lat, dto.lng, MERGE_RADIUS_M, dto.type);
    const target = near.find((r) => shouldMerge(r, incoming));

    let report: Report;
    let merged = false;
    if (target) {
      merged = true;
      report = target;
      if (!target.voters.includes(user.id)) {
        report = applyVote(target, user.id, true, now).report;
        await this.store.save(report);
        this.persist(report, 'active', { userId: user.id, stillThere: true });
        this.trust(target.reporterId, TRUST_ON_CONFIRM);
        this.events.emit({ kind: 'upsert', report: toReportDto(report) });
      }
    } else {
      const reporter = await this.users.findById(user.id);
      report = newReport({ id: randomUUID(), ...incoming, reporterId: user.id, trustScore: reporter?.trustScore ?? 0.3, now });
      await this.store.save(report);
      this.persist(report, 'active');
      this.events.emit({ kind: 'upsert', report: toReportDto(report) });
    }

    this.metrics.reportsCreated.inc({ type: dto.type, merged: String(merged) });
    await this.kv.set(idemKey, report.id, 24 * 3600);
    return { id: report.id, merged, report: toReportDto(report) };
  }

  async vote(user: AuthUser, id: string, stillThere: boolean): Promise<VoteResultDto> {
    const r = await this.store.get(id);
    if (!r) throw new NotFoundException('Report not found or already expired');
    let outcome;
    try {
      outcome = applyVote(r, user.id, stillThere, this.clock.now());
    } catch (e) {
      if (e instanceof AlreadyVotedError) throw new ConflictException('You already voted on this report');
      throw e;
    }
    const next = outcome.report;
    const vote = { userId: user.id, stillThere };
    this.metrics.reportVotes.inc({ still_there: String(stillThere), expired: String(outcome.expired) });
    if (stillThere) this.trust(r.reporterId, TRUST_ON_CONFIRM);
    else if (outcome.expired) this.trust(r.reporterId, TRUST_ON_REJECT);
    if (outcome.expired) {
      await this.store.remove(id);
      this.persist(next, 'expired', vote);
      this.events.emit({ kind: 'remove', report: { id, lat: r.lat, lng: r.lng } });
    } else {
      await this.store.save(next);
      this.persist(next, 'active', vote);
      this.events.emit({ kind: 'upsert', report: toReportDto(next) });
    }
    return {
      id,
      status: outcome.expired ? 'expired' : 'active',
      confidence: next.confidence,
      expiresAt: new Date(outcome.expired ? this.clock.now() : next.expiresAt).toISOString(),
    };
  }

  async nearby(lat: number, lng: number, radiusM: number): Promise<ReportDto[]> {
    return (await this.store.findNear(lat, lng, radiusM)).map(toReportDto);
  }
}
