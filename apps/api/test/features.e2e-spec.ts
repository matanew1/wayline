import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { auth, createApp, FakeClock, guestToken } from './helpers';

const A = { lat: 32.08, lng: 34.78 };
const B = { lat: 32.1, lng: 34.81 };

describe('Profile, lanes, departures, ETA sharing, map themes', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const clock = new FakeClock();

  beforeAll(async () => {
    app = await createApp({ clock });
    http = app.getHttpServer();
  });
  afterAll(() => app.close());

  async function drive(token: string, destinationName?: string) {
    const routes = await request(http).post('/v1/routes').set(auth(token)).send({ origin: A, destination: B }).expect(200);
    const trip = await request(http).post('/v1/trips').set(auth(token)).send({ routeId: routes.body[0].id, destinationName }).expect(201);
    return { route: routes.body[0], tripId: trip.body.tripId as string };
  }

  it('profile: default nickname, rename, reputation and stats from drives and reports', async () => {
    const { token, userId } = await guestToken(app);
    const me = (await request(http).get('/v1/me').set(auth(token)).expect(200)).body;
    expect(me.nickname).toMatch(/^Driver \d{4}$/);
    expect(me.nicknameIsDefault).toBe(true);
    expect(me.reputation).toEqual({ level: 'new', progress: expect.any(Number), next: 'helper' });
    expect(me.stats).toEqual({ drives: 0, distanceM: 0, reports: 0, confirmations: 0 });

    const renamed = (await request(http).patch('/v1/me').set(auth(token)).send({ nickname: '  Night   Owl ' }).expect(200)).body;
    expect(renamed).toMatchObject({ nickname: 'Night Owl', nicknameIsDefault: false });
    await request(http).patch('/v1/me').set(auth(token)).send({ nickname: 'נהג לילה' }).expect(200); // Hebrew is fine
    await request(http).patch('/v1/me').set(auth(token)).send({ nickname: '<script>' }).expect(400);
    await request(http).patch('/v1/me').set(auth(token)).send({ nickname: 'x' }).expect(400);
    const reset = (await request(http).patch('/v1/me').set(auth(token)).send({ nickname: '' }).expect(200)).body;
    expect(reset).toMatchObject({ nickname: me.nickname, nicknameIsDefault: true });

    const { route, tripId } = await drive(token, 'City Hall');
    await request(http).patch(`/v1/trips/${tripId}`).set(auth(token)).send({ status: 'finished' }).expect(200);
    const cancelled = await drive(token, 'Stadium');
    await request(http).patch(`/v1/trips/${cancelled.tripId}`).set(auth(token)).send({ status: 'cancelled' }).expect(200);

    const rep = await request(http).post('/v1/reports').set(auth(token)).send({ type: 'hazard', lat: 32.3, lng: 34.9, clientId: 'profile-rep-1' }).expect(201);
    const other = await guestToken(app);
    await request(http).post(`/v1/reports/${rep.body.id}/votes`).set(auth(other.token)).send({ stillThere: true }).expect(200);

    const after = (await request(http).get('/v1/me').set(auth(token)).expect(200)).body;
    expect(after.id).toBe(userId);
    expect(after.stats).toEqual({ drives: 1, distanceM: route.distanceM, reports: 1, confirmations: 1 });

    const trips = (await request(http).get('/v1/me/trips').set(auth(token)).expect(200)).body;
    expect(trips).toEqual([expect.objectContaining({ id: tripId, destinationName: 'City Hall', distanceM: route.distanceM })]);
    await request(http).get('/v1/me/trips?limit=500').set(auth(token)).expect(400);
  });

  it('routes carry lane guidance and honour the vehicle', async () => {
    const { token } = await guestToken(app);
    const routes = (await request(http).post('/v1/routes').set(auth(token)).send({ origin: A, destination: B, vehicle: 'motorcycle' }).expect(200)).body;
    const turn = routes[0].maneuvers.find((m: any) => m.kind === 'left' || m.kind === 'right');
    expect(turn.lanes).toHaveLength(3);
    expect(turn.lanes.filter((l: any) => l.valid)).toHaveLength(1);
    expect(turn.lanes.find((l: any) => l.valid).indications).toEqual([turn.kind]);
    expect(routes[0].maneuvers[0].lanes).toBeUndefined(); // no lanes on depart
    await request(http).post('/v1/routes').set(auth(token)).send({ origin: A, destination: B, vehicle: 'truck' }).expect(400);
  });

  it('departures: now / +15 / +30 by default, validated offsets', async () => {
    const { token } = await guestToken(app);
    const { route } = await drive(token);
    const deps = (await request(http).get(`/v1/routes/${route.id}/departures`).set(auth(token)).expect(200)).body;
    expect(deps.map((d: any) => d.offsetMin)).toEqual([0, 15, 30]);
    expect(Date.parse(deps[1].departAt) - Date.parse(deps[0].departAt)).toBe(15 * 60_000);
    for (const d of deps) expect(d).toMatchObject({ basis: 'typical', durationS: expect.any(Number) });

    const custom = (await request(http).get(`/v1/routes/${route.id}/departures?offsets=60,0,60`).set(auth(token)).expect(200)).body;
    expect(custom.map((d: any) => d.offsetMin)).toEqual([0, 60]);
    await request(http).get(`/v1/routes/${route.id}/departures?offsets=0,999`).set(auth(token)).expect(400);
    await request(http).get(`/v1/routes/${route.id}/departures?offsets=1,2,3,4,5,6,7`).set(auth(token)).expect(400);
    await request(http).get('/v1/routes/rt_missing/departures').set(auth(token)).expect(404);
  });

  it('shares a live ETA (no location), updates it, shows arrival, then expires', async () => {
    const { token } = await guestToken(app);
    await request(http).patch('/v1/me').set(auth(token)).send({ nickname: 'Dana' }).expect(200);
    const { tripId } = await drive(token, 'Grand Mall & Café');

    const share = (await request(http).post(`/v1/trips/${tripId}/share`).set(auth(token)).send({ remainingS: 600 }).expect(201)).body;
    expect(share.url).toMatch(new RegExp(`/s/${share.token}$`));
    const again = (await request(http).post(`/v1/trips/${tripId}/share`).set(auth(token)).send({}).expect(201)).body;
    expect(again.token).toBe(share.token); // one link per trip

    const view = (await request(http).get(`/v1/share/${share.token}`).expect(200)).body;
    expect(view).toEqual({ driverName: 'Dana', destinationName: 'Grand Mall & Café', status: 'driving', etaEpochMs: expect.any(Number), updatedAt: expect.any(String) });
    expect(JSON.stringify(view)).not.toMatch(/lat|lng/);

    const page = await request(http).get(`/s/${share.token}`).expect(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.text).toContain('Dana is on the way');
    expect(page.text).toContain('Grand Mall &amp; Café'); // escaped
    expect(page.text).toContain('http-equiv="refresh"');
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    const he = await request(http).get(`/s/${share.token}`).set('Accept-Language', 'he-IL,he;q=0.9').expect(200);
    expect(he.text).toContain('dir="rtl"');

    // the ETA check refreshes the shared arrival time
    clock.advance(60_000);
    await request(http).post(`/v1/trips/${tripId}/eta`).set(auth(token)).send(A).expect(200);
    const updated = (await request(http).get(`/v1/share/${share.token}`).expect(200)).body;
    expect(Date.parse(updated.updatedAt)).toBe(clock.now());

    await request(http).patch(`/v1/trips/${tripId}`).set(auth(token)).send({ status: 'finished' }).expect(200);
    const arrived = await request(http).get(`/s/${share.token}`).expect(200);
    expect(arrived.text).toContain('Dana has arrived');
    expect(arrived.text).not.toContain('http-equiv="refresh"');

    // someone else can't share or unshare this trip; unknown links 404
    const other = await guestToken(app);
    await request(http).post(`/v1/trips/${tripId}/share`).set(auth(other.token)).send({}).expect(404);
    await request(http).get('/v1/share/not-a-real-token-123456').expect(404);
    await request(http).get('/s/short').expect(404);
  });

  it('revokes a share link', async () => {
    const { token } = await guestToken(app);
    const { tripId } = await drive(token);
    const share = (await request(http).post(`/v1/trips/${tripId}/share`).set(auth(token)).send({}).expect(201)).body;
    await request(http).delete(`/v1/trips/${tripId}/share`).set(auth(token)).expect(204);
    await request(http).get(`/v1/share/${share.token}`).expect(404);
    const gone = await request(http).get(`/s/${share.token}`).expect(404);
    expect(gone.text).toContain('This link has expired');
  });

  it('serves light and dark map styles on fallback tiles', async () => {
    const light = (await request(http).get('/map/style.json').expect(200)).body;
    expect(light.sources.openmaptiles.url).toBe('https://tiles.openfreemap.org/planet');
    expect(light.metadata['wayline:theme']).toBe('light');
    const dark = (await request(http).get('/map/style.json?theme=dark&lang=he').expect(200)).body;
    expect(dark.metadata['wayline:theme']).toBe('dark');
    const bg = (s: any) => s.layers.find((l: any) => l.id === 'background').paint['background-color'];
    expect(bg(light)).toBe('#EEF0F3');
    expect(bg(dark)).toBe('#1D1A3A');
    expect(JSON.stringify(dark)).not.toContain('__');
  });
});
