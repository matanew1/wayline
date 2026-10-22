/**
 * Runs the whole API against real PostgreSQL/PostGIS and Redis (Kafka replaced by an in-memory sink).
 *   docker compose up -d postgres redis   (or any reachable instances)
 *   DATABASE_URL=... REDIS_URL=... npm run test:integration
 */
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { resolve } from 'node:path';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PROBE_SINK } from '../src/common/tokens';
import { MemoryProbeSink } from '../src/modules/trips/probe-sink';
import { migrate } from '../src/scripts/migrate';
import { auth } from './helpers';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://wayline:wayline@127.0.0.1:5432/wayline_test';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/15';

async function waitFor<T>(fn: () => Promise<T | undefined>, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('API on Postgres + Redis', () => {
  let app: INestApplication;
  let http: any;
  let db: Client;
  const sink = new MemoryProbeSink();

  beforeAll(async () => {
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const dir = resolve(__dirname, '../../../infra/sql');
    await migrate(DATABASE_URL, dir, () => undefined);
    await migrate(DATABASE_URL, dir, () => undefined); // idempotent

    const redis = new Redis(REDIS_URL);
    await redis.flushdb();
    await redis.quit();

    Object.assign(process.env, {
      NODE_ENV: 'test', STORE_DRIVER: 'infra', ROUTING_DRIVER: 'mock', GEOCODER_DRIVER: 'memory', OTP_DEV_ECHO: 'true',
      DATABASE_URL, REDIS_URL,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PROBE_SINK).useValue(sink).compile();
    app = moduleRef.createNestApplication({ logger: ['error'] });
    configureApp(app);
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    await db?.end();
  });

  it('reports healthy dependencies', async () => {
    const h = await request(http).get('/health').expect(200);
    expect(h.body.checks).toEqual({ redis: 'ok', postgres: 'ok' });
  });

  it('OTP sign-in creates one user per phone', async () => {
    const phone = '+972541112233';
    const login = async () => {
      const otp = await request(http).post('/v1/auth/otp').send({ phone }).expect(200);
      return (await request(http).post('/v1/auth/verify').send({ phone, code: otp.body.devCode }).expect(200)).body;
    };
    const first = await login();
    const r = new Redis(REDIS_URL);
    const keys = await r.keys('otp:cool:*'); // skip the 30 s resend cooldown
    if (keys.length) await r.del(...keys);
    await r.quit();
    const second = await login();
    expect(second.userId).toBe(first.userId);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM users WHERE is_guest = false');
    expect(rows[0].n).toBe(1);
  });

  it('saved places persist with PostGIS geometry and one home per user', async () => {
    const { body: g } = await request(http).post('/v1/auth/guest').expect(200);
    await request(http).put('/v1/me/places').set(auth(g.accessToken)).send({ kind: 'home', name: 'A', lat: 32.09, lng: 34.88 }).expect(200);
    await request(http).put('/v1/me/places').set(auth(g.accessToken)).send({ kind: 'home', name: 'B', lat: 32.1, lng: 34.89 }).expect(200);
    await request(http).put('/v1/me/places').set(auth(g.accessToken)).send({ kind: 'fav', name: 'Gym', lat: 32.11, lng: 34.8 }).expect(200);
    const list = await request(http).get('/v1/me/places').set(auth(g.accessToken)).expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.find((p: any) => p.kind === 'home')).toMatchObject({ name: 'B', lat: 32.1, lng: 34.89 });
  });

  it('trip lifecycle and probes', async () => {
    const { body: g } = await request(http).post('/v1/auth/guest').expect(200);
    const routes = await request(http).post('/v1/routes').set(auth(g.accessToken))
      .send({ origin: { lat: 32.08, lng: 34.78 }, destination: { lat: 32.1, lng: 34.81 } }).expect(200);
    const trip = await request(http).post('/v1/trips').set(auth(g.accessToken)).send({ routeId: routes.body[0].id }).expect(201);
    await request(http).post('/v1/probes').send({ probeToken: trip.body.probeToken, fixes: [{ t: Date.now(), lat: 32.08, lng: 34.78, acc: 4 }] }).expect(202);
    expect(sink.messages).toHaveLength(1);
    expect(JSON.stringify(sink.messages[0])).not.toContain(g.userId);

    await request(http).patch(`/v1/trips/${trip.body.tripId}`).set(auth(g.accessToken)).send({ status: 'finished' }).expect(200);
    const { rows } = await db.query('SELECT status, ended_at, ST_Y(origin::geometry) AS lat FROM trips WHERE id = $1', [trip.body.tripId]);
    expect(rows[0]).toMatchObject({ status: 'finished', lat: 32.08 });
    expect(rows[0].ended_at).not.toBeNull();
  });

  it('profile, recent drives, report stats, departures and ETA sharing on Postgres + Redis', async () => {
    const { body: g } = await request(http).post('/v1/auth/guest').expect(200);
    const h = auth(g.accessToken);
    await request(http).patch('/v1/me').set(h).send({ nickname: 'Night Owl' }).expect(200);
    expect((await db.query('SELECT display_name FROM users WHERE id = $1', [g.userId])).rows[0].display_name).toBe('Night Owl');

    const routes = await request(http).post('/v1/routes').set(h).send({ origin: { lat: 32.08, lng: 34.78 }, destination: { lat: 32.1, lng: 34.81 } }).expect(200);
    const trip = await request(http).post('/v1/trips').set(h).send({ routeId: routes.body[0].id, destinationName: 'City Hall' }).expect(201);
    const share = (await request(http).post(`/v1/trips/${trip.body.tripId}/share`).set(h).send({ remainingS: 300 }).expect(201)).body;
    expect((await request(http).get(`/v1/share/${share.token}`).expect(200)).body).toMatchObject({ driverName: 'Night Owl', destinationName: 'City Hall', status: 'driving' });
    await request(http).patch(`/v1/trips/${trip.body.tripId}`).set(h).send({ status: 'finished' }).expect(200);
    expect((await request(http).get(`/v1/share/${share.token}`).expect(200)).body.status).toBe('arrived');

    const rep = await request(http).post('/v1/reports').set(h).send({ type: 'hazard', lat: 32.45, lng: 34.95, clientId: 'int-profile-01' }).expect(201);
    const { body: other } = await request(http).post('/v1/auth/guest').expect(200);
    await request(http).post(`/v1/reports/${rep.body.id}/votes`).set(auth(other.accessToken)).send({ stillThere: true }).expect(200);
    await waitFor(async () => ((await db.query('SELECT 1 FROM report_votes WHERE report_id = $1', [rep.body.id])).rowCount ? true : undefined));

    const me = (await request(http).get('/v1/me').set(h).expect(200)).body;
    expect(me).toMatchObject({ nickname: 'Night Owl', stats: { drives: 1, distanceM: routes.body[0].distanceM, reports: 1, confirmations: 1 } });
    const recent = (await request(http).get('/v1/me/trips').set(h).expect(200)).body;
    expect(recent).toEqual([expect.objectContaining({ destinationName: 'City Hall' })]);

    // historic baselines come from edge_speeds_hourly (mock routes have no OSM ways → typical)
    await db.query('INSERT INTO edge_speeds_hourly (edge_id, hour_of_week, p50_kmh, samples) VALUES (42, 10, 31.5, 9), (43, 10, 20, 1)');
    const { HISTORIC_STORE } = await import('../src/modules/routing/routing.tokens');
    const usual = await app.get(HISTORIC_STORE).getHourly([42, 43, 44], 10);
    expect([...usual]).toEqual([[42, 31.5]]); // too few samples on 43
    const deps = (await request(http).get(`/v1/routes/${routes.body[1].id}/departures`).set(h).expect(200)).body;
    expect(deps.map((d: any) => d.basis)).toEqual(['typical', 'typical', 'typical']);
  });

  it('account deletion removes personal data and anonymises reports', async () => {
    const { body: g } = await request(http).post('/v1/auth/guest').expect(200);
    const h = auth(g.accessToken);
    await request(http).put('/v1/me/places').set(h).send({ kind: 'work', name: 'Work', lat: 32.1, lng: 34.8 }).expect(200);
    const routes = await request(http).post('/v1/routes').set(h).send({ origin: { lat: 32.1, lng: 34.8 }, destination: { lat: 32.11, lng: 34.82 } }).expect(200);
    await request(http).post('/v1/trips').set(h).send({ routeId: routes.body[0].id }).expect(201);
    const rep = await request(http).post('/v1/reports').set(h).send({ type: 'camera', lat: 32.5, lng: 34.95, clientId: 'int-delete-01' }).expect(201);
    await waitFor(async () => ((await db.query('SELECT 1 FROM reports WHERE id = $1', [rep.body.id])).rowCount ? true : undefined));

    await request(http).delete('/v1/me').set(h).expect(204);
    await request(http).get('/v1/me').set(h).expect(401);

    const count = async (sql: string) => (await db.query(sql, [g.userId])).rows[0].n;
    expect(await count('SELECT count(*)::int AS n FROM users WHERE id = $1')).toBe(0);
    expect(await count('SELECT count(*)::int AS n FROM trips WHERE user_id = $1')).toBe(0);
    expect(await count('SELECT count(*)::int AS n FROM saved_places WHERE user_id = $1')).toBe(0);
    const { rows } = await db.query('SELECT reporter_id FROM reports WHERE id = $1', [rep.body.id]);
    expect(rows[0].reporter_id).toBeNull();
  });

  it('reports: Redis GEO for live data, Postgres for history', async () => {
    const users = await Promise.all([0, 1, 2].map(() => request(http).post('/v1/auth/guest').expect(200).then((r) => r.body)));
    const spot = { lat: 32.0701, lng: 34.7942 };
    const created = await request(http).post('/v1/reports').set(auth(users[0].accessToken))
      .send({ type: 'hazard', ...spot, heading: 180, clientId: 'int-hazard-001' }).expect(201);
    const merged = await request(http).post('/v1/reports').set(auth(users[1].accessToken))
      .send({ type: 'hazard', lat: spot.lat + 0.0005, lng: spot.lng, heading: 170, clientId: 'int-hazard-002' }).expect(201);
    expect(merged.body).toMatchObject({ id: created.body.id, merged: true });

    const near = await request(http).get('/v1/reports/nearby').query({ ...spot, radiusM: 300 }).set(auth(users[2].accessToken)).expect(200);
    expect(near.body.map((r: any) => r.id)).toEqual([created.body.id]);
    const far = await request(http).get('/v1/reports/nearby').query({ lat: 31.77, lng: 35.21, radiusM: 1000 }).set(auth(users[2].accessToken)).expect(200);
    expect(far.body).toEqual([]);

    const row = await waitFor(async () => {
      const { rows } = await db.query(
        `SELECT r.status, r.confidence, ST_Y(r.geom::geometry) AS lat, (SELECT count(*)::int FROM report_votes v WHERE v.report_id = r.id) AS votes
         FROM reports r WHERE r.id = $1`, [created.body.id]);
      return rows[0]?.votes === 1 ? rows[0] : undefined;
    });
    expect(row).toMatchObject({ status: 'active', lat: spot.lat });

    // Expire via two "not there" votes; history row flips to expired, Redis entry disappears.
    const voters = await Promise.all([0, 1].map(() => request(http).post('/v1/auth/guest').expect(200).then((r) => r.body)));
    for (const v of voters) {
      await request(http).post(`/v1/reports/${created.body.id}/votes`).set(auth(v.accessToken)).send({ stillThere: false }).expect(200);
    }
    const after = await request(http).get('/v1/reports/nearby').query({ ...spot, radiusM: 300 }).set(auth(users[2].accessToken)).expect(200);
    expect(after.body).toEqual([]);
    await waitFor(async () => {
      const { rows } = await db.query('SELECT status FROM reports WHERE id = $1', [created.body.id]);
      return rows[0]?.status === 'expired' ? true : undefined;
    });
  });
});
