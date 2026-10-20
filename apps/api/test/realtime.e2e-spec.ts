import { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { geohashEncode } from '../src/common/geo';
import { auth, createApp, guestToken } from './helpers';

function connect(url: string, token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(`${url}/rt`, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const next = <T>(s: Socket, event: string, ms = 2000) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    s.once(event, (d: T) => { clearTimeout(t); resolve(d); });
  });

describe('realtime gateway', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    app = await createApp();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(() => app.close());

  it('pushes report upserts and removals to subscribers of the cell only', async () => {
    const reporter = await guestToken(app);
    const driver = await guestToken(app);
    const spot = { lat: 32.0853, lng: 34.7818 };

    const near = await connect(url, driver.token);
    const far = await connect(url, driver.token);
    expect(await near.emitWithAck('subscribe', { cells: [geohashEncode(spot.lat, spot.lng, 6)] })).toEqual({ ok: true, cells: 1 });
    expect(await far.emitWithAck('subscribe', { cells: [geohashEncode(31.77, 35.21, 6)] })).toEqual({ ok: true, cells: 1 });
    let farGot = false;
    far.on('report.upsert', () => { farGot = true; });

    const upsert = next<any>(near, 'report.upsert');
    const res = await request(app.getHttpServer()).post('/v1/reports').set(auth(reporter.token))
      .send({ type: 'crash', ...spot, clientId: 'rt-test-00001' }).expect(201);
    const pushed = await upsert;
    expect(pushed).toMatchObject({ id: res.body.id, type: 'crash' });
    expect(pushed).not.toHaveProperty('reporterId');

    const removed = next<any>(near, 'report.remove');
    const voters = [await guestToken(app), await guestToken(app)];
    for (const v of voters) {
      await request(app.getHttpServer()).post(`/v1/reports/${res.body.id}/votes`).set(auth(v.token)).send({ stillThere: false }).expect(200);
    }
    expect(await removed).toEqual({ id: res.body.id });
    expect(farGot).toBe(false);

    near.close();
    far.close();
  });

  it('rejects bad subscriptions and unauthenticated sockets', async () => {
    const { token } = await guestToken(app);
    const s = await connect(url, token);
    expect((await s.emitWithAck('subscribe', { cells: ['NOT-A-HASH'] })).ok).toBe(false);
    expect((await s.emitWithAck('subscribe', { cells: 'sv8wrq' })).ok).toBe(false);
    s.close();

    const anon = io(`${url}/rt`, { transports: ['websocket'], reconnection: false });
    await next(anon, 'disconnect');
    anon.close();
  });
});
