import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { decodePolyline } from '../src/common/geo';
import { auth, createApp, FakeClock, guestToken, guestTokenViaHttp } from './helpers';

describe('Wayline API (in-memory drivers)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const clock = new FakeClock();

  beforeAll(async () => {
    app = await createApp({ clock });
    http = app.getHttpServer();
  });
  afterAll(() => app.close());

  describe('auth', () => {
    it('signs in with an OTP and refreshes', async () => {
      const phone = '+972501234567';
      const otp = await request(http).post('/v1/auth/otp').send({ phone }).expect(200);
      expect(otp.body.sentTo).toBe('+97250•••4567');
      expect(otp.body.devCode).toMatch(/^\d{6}$/);

      await request(http).post('/v1/auth/otp').send({ phone }).expect(429); // cooldown

      const wrong = otp.body.devCode === '000000' ? '111111' : '000000';
      await request(http).post('/v1/auth/verify').send({ phone, code: wrong }).expect(401);

      const ok = await request(http).post('/v1/auth/verify').send({ phone, code: otp.body.devCode }).expect(200);
      expect(ok.body.guest).toBe(false);
      await request(http).post('/v1/auth/verify').send({ phone, code: otp.body.devCode }).expect(401); // single use

      const refreshed = await request(http).post('/v1/auth/refresh').send({ refreshToken: ok.body.refreshToken }).expect(200);
      expect(refreshed.body.userId).toBe(ok.body.userId);
      await request(http).post('/v1/auth/refresh').send({ refreshToken: ok.body.accessToken }).expect(401); // access ≠ refresh
    });

    it('lets the configured store-review number sign in with its fixed code, without SMS', async () => {
      const { SMS_SENDER, CONFIG } = await import('../src/common/tokens');
      const sms = app.get(SMS_SENDER);
      const spy = jest.spyOn(sms, 'send');
      const cfg = app.get(CONFIG);
      cfg.review = { phone: '+972500000001', code: '424242' };
      try {
        await request(http).post('/v1/auth/otp').send({ phone: '+972500000001' }).expect(200);
        expect(spy).not.toHaveBeenCalled();
        const ok = await request(http).post('/v1/auth/verify').send({ phone: '+972500000001', code: '424242' }).expect(200);
        expect(ok.body.guest).toBe(false);
      } finally {
        cfg.review = null;
        spy.mockRestore();
      }
    });

    it('issues guest sessions over HTTP', async () => {
      const g = await guestTokenViaHttp(app);
      await request(http).get('/v1/me/places').set(auth(g.token)).expect(200);
    });

    it('rejects bad phone numbers and missing tokens', async () => {
      await request(http).post('/v1/auth/otp').send({ phone: '0501234567' }).expect(400);
      await request(http).post('/v1/routes').send({}).expect(401);
      await request(http).get('/v1/me/places').set(auth('garbage')).expect(401);
    });
  });

  describe('places', () => {
    it('searches and manages saved places', async () => {
      const { token } = await guestToken(app);
      const found = await request(http).get('/v1/places/search').query({ q: 'city', lat: 32.08, lng: 34.78 }).set(auth(token)).expect(200);
      expect(found.body.map((p: any) => p.name)).toEqual(expect.arrayContaining(['City Hall', 'City Park']));
      expect(found.body[0].distanceM).toBeLessThanOrEqual(found.body[1].distanceM);

      const home = { kind: 'home', name: 'Home', lat: 32.09, lng: 34.88 };
      await request(http).put('/v1/me/places').set(auth(token)).send(home).expect(200);
      await request(http).put('/v1/me/places').set(auth(token)).send({ ...home, name: 'New home' }).expect(200);
      const fav = await request(http).put('/v1/me/places').set(auth(token)).send({ kind: 'fav', name: 'Gym', lat: 32.1, lng: 34.8 }).expect(200);
      const list = await request(http).get('/v1/me/places').set(auth(token)).expect(200);
      expect(list.body.map((p: any) => p.name).sort()).toEqual(['Gym', 'New home']);

      await request(http).delete(`/v1/me/places/${fav.body.id}`).set(auth(token)).expect(204);
      await request(http).delete(`/v1/me/places/${fav.body.id}`).set(auth(token)).expect(404);
      await request(http).put('/v1/me/places').set(auth(token)).send({ kind: 'office', name: 'x', lat: 0, lng: 0 }).expect(400);
    });
  });

  describe('routes → trip → probes', () => {
    it('plans routes, starts a trip, ingests probes, finishes', async () => {
      const { token } = await guestToken(app);
      const routes = await request(http)
        .post('/v1/routes').set(auth(token))
        .send({ origin: { lat: 32.08, lng: 34.78 }, destination: { lat: 32.1, lng: 34.81 }, avoid: ['tolls'] })
        .expect(200);
      expect(routes.body).toHaveLength(2);
      const r = routes.body[0];
      expect(r.id).toMatch(/^rt_/);
      expect(decodePolyline(r.polyline6).length).toBeGreaterThan(1);
      expect(r.cells.length).toBeGreaterThan(0);
      expect(r.maneuvers.at(-1).kind).toBe('arrive');

      await request(http).post('/v1/routes').set(auth(token)).send({ origin: { lat: 32.08, lng: 34.78 }, destination: { lat: 32.08, lng: 34.78 } }).expect(404);
      await request(http).post('/v1/routes').set(auth(token)).send({ origin: { lat: 99, lng: 0 }, destination: { lat: 0, lng: 0 } }).expect(400);

      const trip = await request(http).post('/v1/trips').set(auth(token)).send({ routeId: r.id }).expect(201);
      const { tripId, probeToken } = trip.body;

      const now = clock.now();
      const probes = await request(http).post('/v1/probes').send({
        probeToken,
        fixes: [
          { t: now - 2000, lat: 32.08, lng: 34.78, speed: 11, heading: 0, acc: 5 },
          { t: now - 1000, lat: 32.081, lng: 34.78, speed: 12, heading: 0, acc: 400 }, // too inaccurate
          { t: now, lat: 32.082, lng: 34.78, speed: 12, heading: 0, acc: 6 },
        ],
      }).expect(202);
      expect(probes.body).toEqual({ accepted: 2, dropped: 1 });

      // reroute onto the alternative
      const rerouted = await request(http).patch(`/v1/trips/${tripId}`).set(auth(token)).send({ routeId: routes.body[1].id }).expect(200);
      expect(rerouted.body.routeId).toBe(routes.body[1].id);

      // another user cannot touch this trip
      const other = await guestToken(app);
      await request(http).patch(`/v1/trips/${tripId}`).set(auth(other.token)).send({ status: 'finished' }).expect(404);

      const done = await request(http).patch(`/v1/trips/${tripId}`).set(auth(token)).send({ status: 'finished' }).expect(200);
      expect(done.body.status).toBe('finished');
      expect(done.body.endedAt).toBeDefined();
      await request(http).patch(`/v1/trips/${tripId}`).set(auth(token)).send({ status: 'cancelled' }).expect(409);
      await request(http).post('/v1/probes').send({ probeToken, fixes: [{ t: now, lat: 32.08, lng: 34.78 }] }).expect(401); // revoked
    });
  });

  describe('reports', () => {
    const spot = { lat: 32.0853, lng: 34.7818 };

    it('creates, merges duplicates, votes and expires', async () => {
      const a = await guestToken(app);
      const b = await guestToken(app);
      const c = await guestToken(app);

      const created = await request(http).post('/v1/reports').set(auth(a.token))
        .send({ type: 'police', ...spot, heading: 90, clientId: 'client-a-0001' }).expect(201);
      expect(created.body.merged).toBe(false);
      const id = created.body.id;

      // retry with same clientId is idempotent
      const retry = await request(http).post('/v1/reports').set(auth(a.token))
        .send({ type: 'police', ...spot, heading: 90, clientId: 'client-a-0001' }).expect(201);
      expect(retry.body.id).toBe(id);

      // b reports the same thing 50 m away → merged as a confirmation
      const dup = await request(http).post('/v1/reports').set(auth(b.token))
        .send({ type: 'police', lat: spot.lat + 0.0004, lng: spot.lng, heading: 80, clientId: 'client-b-0001' }).expect(201);
      expect(dup.body).toMatchObject({ id, merged: true });
      expect(dup.body.report.confidence).toBeGreaterThan(created.body.report.confidence);

      // opposite direction → separate report
      const opposite = await request(http).post('/v1/reports').set(auth(b.token))
        .send({ type: 'police', ...spot, heading: 270, clientId: 'client-b-0002' }).expect(201);
      expect(opposite.body.merged).toBe(false);

      const near = await request(http).get('/v1/reports/nearby').query({ ...spot, radiusM: 500 }).set(auth(c.token)).expect(200);
      expect(near.body.map((r: any) => r.id)).toEqual(expect.arrayContaining([id, opposite.body.id]));
      expect(near.body[0]).not.toHaveProperty('reporterId');

      await request(http).post(`/v1/reports/${id}/votes`).set(auth(a.token)).send({ stillThere: true }).expect(409); // reporter
      const v1 = await request(http).post(`/v1/reports/${id}/votes`).set(auth(c.token)).send({ stillThere: false }).expect(200);
      expect(v1.body.status).toBe('active');
      const d = await guestToken(app);
      const v2 = await request(http).post(`/v1/reports/${id}/votes`).set(auth(d.token)).send({ stillThere: false }).expect(200);
      expect(v2.body.status).toBe('expired');
      await request(http).post(`/v1/reports/${id}/votes`).set(auth(d.token)).send({ stillThere: true }).expect(404);
    });

    it('expires reports by TTL', async () => {
      const a = await guestToken(app);
      const where = { lat: 32.2, lng: 34.9 };
      await request(http).post('/v1/reports').set(auth(a.token)).send({ type: 'traffic', ...where, clientId: 'ttl-test-0001' }).expect(201);
      let near = await request(http).get('/v1/reports/nearby').query(where).set(auth(a.token)).expect(200);
      expect(near.body).toHaveLength(1);
      clock.advance(31 * 60_000);
      near = await request(http).get('/v1/reports/nearby').query(where).set(auth(a.token)).expect(200);
      expect(near.body).toHaveLength(0);
    });

    it('rate-limits reports per user', async () => {
      const a = await guestToken(app);
      for (let i = 0; i < 10; i++) {
        await request(http).post('/v1/reports').set(auth(a.token))
          .send({ type: 'hazard', lat: 31 + i * 0.05, lng: 35, clientId: `rate-${i}-xxxx` }).expect(201);
      }
      await request(http).post('/v1/reports').set(auth(a.token)).send({ type: 'hazard', lat: 30, lng: 35, clientId: 'rate-over-x' }).expect(429);
    });
  });

  describe('live traffic', () => {
    it('adds speed limits, re-ranks by live speeds and suggests faster routes mid-trip', async () => {
      const { TRAFFIC_STORE } = await import('../src/modules/routing/routing.tokens');
      const { ROUTING_ENGINE } = await import('../src/common/tokens');
      const traffic = app.get(TRAFFIC_STORE);
      const engine = app.get(ROUTING_ENGINE);
      const { token } = await guestToken(app);
      const body = { origin: { lat: 32.3, lng: 34.85 }, destination: { lat: 32.32, lng: 34.88 } };

      const first = await request(http).post('/v1/routes').set(auth(token)).send(body).expect(200);
      expect(first.body[0].speedLimits[0]).toMatchObject({ fromM: 0, kmh: 50 });
      expect(first.body[0].traffic).toMatchObject({ liveEdges: 0, congestion: [] });
      const fastestFreeFlow = first.body[0];

      // jam the free-flow fastest route
      for (const e of await engine.edges(fastestFreeFlow.polyline6)) {
        await traffic.setSpeed(e.id, { kmh: 5, samples: 12, updatedAt: clock.now() });
      }
      const second = await request(http).post('/v1/routes').set(auth(token)).send(body).expect(200);
      expect(second.body[0].polyline6).not.toBe(fastestFreeFlow.polyline6);
      const jammed = second.body.find((r: any) => r.polyline6 === fastestFreeFlow.polyline6);
      expect(jammed.durationS).toBeGreaterThan(fastestFreeFlow.durationS * 3);
      expect(jammed.traffic.congestion[0].level).toBe('jam');

      // driving the jammed route → the ETA check offers the other one
      const trip = await request(http).post('/v1/trips').set(auth(token)).send({ routeId: jammed.id }).expect(201);
      const eta = await request(http).post(`/v1/trips/${trip.body.tripId}/eta`).set(auth(token)).send(body.origin).expect(200);
      expect(eta.body.remainingS).toBeGreaterThan(jammed.durationS * 0.9);
      expect(eta.body.liveEdges).toBeGreaterThan(0);
      expect(eta.body.fasterRoute.polyline6).not.toBe(jammed.polyline6);
      expect(eta.body.savingS).toBeGreaterThanOrEqual(180);
      expect(eta.body.offRouteM).toBeLessThan(5);

      // and switching to it is a normal reroute
      await request(http).patch(`/v1/trips/${trip.body.tripId}`).set(auth(token)).send({ routeId: eta.body.fasterRoute.id }).expect(200);
      const after = await request(http).post(`/v1/trips/${trip.body.tripId}/eta`).set(auth(token)).send(body.origin).expect(200);
      expect(after.body.fasterRoute).toBeUndefined();
    });
  });

  describe('account', () => {
    it('returns the profile and deletes the account with its personal data', async () => {
      const phone = '+972521234000';
      const otp = await request(http).post('/v1/auth/otp').send({ phone }).expect(200);
      const login = (await request(http).post('/v1/auth/verify').send({ phone, code: otp.body.devCode }).expect(200)).body;
      const h = auth(login.accessToken);

      const me = await request(http).get('/v1/me').set(h).expect(200);
      expect(me.body).toMatchObject({ id: login.userId, guest: false, trustScore: 0.5 });

      await request(http).put('/v1/me/places').set(h).send({ kind: 'home', name: 'Home', lat: 32.1, lng: 34.8 }).expect(200);
      const routes = await request(http).post('/v1/routes').set(h).send({ origin: { lat: 32.1, lng: 34.8 }, destination: { lat: 32.11, lng: 34.82 } }).expect(200);
      await request(http).post('/v1/trips').set(h).send({ routeId: routes.body[0].id }).expect(201);
      const rep = await request(http).post('/v1/reports').set(h).send({ type: 'closure', lat: 32.4, lng: 34.9, clientId: 'delete-test-01' }).expect(201);

      await request(http).delete('/v1/me').set(h).expect(204);

      // the old tokens stop working at once
      await request(http).get('/v1/me/places').set(h).expect(401);
      await request(http).post('/v1/auth/refresh').send({ refreshToken: login.refreshToken }).expect(401);
      // the community report stays, without its reporter
      const other = await guestToken(app);
      const near = await request(http).get('/v1/reports/nearby').query({ lat: 32.4, lng: 34.9, radiusM: 500 }).set(auth(other.token)).expect(200);
      expect(near.body.map((r: any) => r.id)).toContain(rep.body.id);
      // signing in again with the same phone starts a fresh account (after the resend cooldown)
      clock.advance(31_000);
      const otp2 = await request(http).post('/v1/auth/otp').send({ phone }).expect(200);
      const again = (await request(http).post('/v1/auth/verify').send({ phone, code: otp2.body.devCode }).expect(200)).body;
      expect(again.userId).not.toBe(login.userId);
      expect((await request(http).get('/v1/me/places').set(auth(again.accessToken)).expect(200)).body).toEqual([]);
    });
  });

  describe('trust score', () => {
    it('rises when others confirm a report and falls when it is voted away', async () => {
      const { USERS_REPO } = await import('../src/common/tokens');
      const users = app.get(USERS_REPO);
      const reporter = await guestToken(app);
      const trustOf = async () => (await users.findById(reporter.userId))!.trustScore;
      const before = await trustOf();

      const spot = { lat: 31.9, lng: 34.9 };
      const r1 = await request(http).post('/v1/reports').set(auth(reporter.token)).send({ type: 'hazard', ...spot, clientId: 'trust-a-0001' }).expect(201);
      const c1 = await guestToken(app);
      await request(http).post(`/v1/reports/${r1.body.id}/votes`).set(auth(c1.token)).send({ stillThere: true }).expect(200);
      // a duplicate report by someone else counts as a confirmation too
      const c2 = await guestToken(app);
      await request(http).post('/v1/reports').set(auth(c2.token)).send({ type: 'hazard', ...spot, clientId: 'trust-b-0001' }).expect(201);
      await new Promise((r) => setTimeout(r, 20));
      const confirmed = await trustOf();
      expect(confirmed).toBeCloseTo(before + 0.04, 5);

      const r2 = await request(http).post('/v1/reports').set(auth(reporter.token)).send({ type: 'crash', lat: 31.95, lng: 34.95, clientId: 'trust-a-0002' }).expect(201);
      for (const v of [await guestToken(app), await guestToken(app)]) {
        await request(http).post(`/v1/reports/${r2.body.id}/votes`).set(auth(v.token)).send({ stillThere: false }).expect(200);
      }
      await new Promise((r) => setTimeout(r, 20));
      expect(await trustOf()).toBeCloseTo(confirmed - 0.05, 5);
    });
  });

  it('serves the privacy policy and account-deletion pages in both languages', async () => {
    const en = await request(http).get('/privacy').expect(200);
    expect(en.headers['content-type']).toContain('text/html');
    expect(en.text).toContain('Wayline privacy policy');
    expect(en.text).toContain('first and last 300 metres');
    const he = await request(http).get('/privacy?lang=he').expect(200);
    expect(he.text).toContain('dir="rtl"');
    expect(he.text).toContain('מדיניות הפרטיות');
    const del = await request(http).get('/delete-account').expect(200);
    expect(del.text).toContain('Settings → Account → Delete account');
    // the draft banner shows until the operator fills in the placeholders
    expect(en.text).toContain('class="warn"');
  });

  it('serves the map style: fallback tiles, or our tiles with localised labels', async () => {
    const fallback = await request(http).get('/map/style.json').expect(200);
    expect(fallback.body.sources.openmaptiles.url).toBe('https://tiles.openfreemap.org/planet');
    const { CONFIG } = await import('../src/common/tokens');
    const cfg = app.get(CONFIG);
    cfg.map = { ...cfg.map, tilesUrl: 'https://tiles.example.com/israel' };
    try {
      const he = await request(http).get('/map/style.json?lang=he').expect(200);
      expect(he.body.sources.openmaptiles.url).toBe('https://tiles.example.com/israel');
      const label = he.body.layers.find((l: any) => l.id === 'road-label');
      expect(label.layout['text-field']).toEqual(['coalesce', ['get', 'name:he'], ['get', 'name']]);
      expect(JSON.stringify(he.body)).not.toContain('__');
    } finally {
      cfg.map = { ...cfg.map, tilesUrl: null };
    }
  });

  it('exposes Prometheus metrics', async () => {
    const res = await request(http).get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('wayline_reports_created_total{type="police",merged="false"}');
    expect(res.text).toMatch(/wayline_http_request_duration_seconds_count\{method="POST",route="\/v1\/reports",status="201"\} \d+/);
    expect(res.text).toContain('wayline_probe_fixes_total{result="dropped"} 1');
  });

  it('serves health and OpenAPI docs', async () => {
    const h = await request(http).get('/health').expect(200);
    expect(h.body.storeDriver).toBe('memory');
    const docs = await request(http).get('/docs-json').expect(200);
    expect(Object.keys(docs.body.paths)).toEqual(expect.arrayContaining(['/v1/routes', '/v1/reports', '/v1/probes']));
  });
});
