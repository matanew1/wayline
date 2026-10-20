/** Two API replicas sharing Redis: a report written on replica B reaches a socket connected to replica A. */
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { geohashEncode } from '../src/common/geo';
import { PROBE_SINK } from '../src/common/tokens';
import { RedisIoAdapter } from '../src/modules/realtime/redis-io.adapter';
import { MemoryProbeSink } from '../src/modules/trips/probe-sink';
import { auth } from './helpers';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://wayline:wayline@127.0.0.1:5432/wayline_test';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/15';

async function replica(): Promise<{ app: INestApplication; url: string }> {
  Object.assign(process.env, { NODE_ENV: 'test', STORE_DRIVER: 'infra', ROUTING_DRIVER: 'mock', GEOCODER_DRIVER: 'memory', DATABASE_URL, REDIS_URL });
  const m = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PROBE_SINK).useValue(new MemoryProbeSink()).compile();
  const app = m.createNestApplication({ logger: ['error'] });
  const adapter = new RedisIoAdapter(app, REDIS_URL);
  await adapter.connect();
  app.useWebSocketAdapter(adapter);
  configureApp(app);
  await app.listen(0);
  return { app, url: `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}` };
}

describe('realtime across replicas', () => {
  let a: Awaited<ReturnType<typeof replica>>;
  let b: Awaited<ReturnType<typeof replica>>;

  beforeAll(async () => {
    a = await replica();
    b = await replica();
  });
  afterAll(async () => {
    await a?.app.close();
    await b?.app.close();
  });

  it('fans out report events through the Redis adapter', async () => {
    const spot = { lat: 32.0609, lng: 34.7701 };
    const { body: driver } = await request(a.app.getHttpServer()).post('/v1/auth/guest').expect(200);
    const { body: reporter } = await request(b.app.getHttpServer()).post('/v1/auth/guest').expect(200);

    const socket = io(`${a.url}/rt`, { auth: { token: driver.accessToken }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((res, rej) => { socket.on('connect', () => res()); socket.on('connect_error', rej); });
    await socket.emitWithAck('subscribe', { cells: [geohashEncode(spot.lat, spot.lng, 6)] });

    const got = new Promise<any>((res, rej) => {
      const t = setTimeout(() => rej(new Error('no cross-replica event')), 3000);
      socket.once('report.upsert', (d) => { clearTimeout(t); res(d); });
    });
    const created = await request(b.app.getHttpServer()).post('/v1/reports').set(auth(reporter.accessToken))
      .send({ type: 'closure', ...spot, clientId: 'cluster-test-01' }).expect(201);
    expect((await got).id).toBe(created.body.id);
    socket.close();
  });
});
