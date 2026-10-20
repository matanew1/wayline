import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { CLOCK, Clock } from '../src/common/tokens';

export class FakeClock implements Clock {
  constructor(public t = Date.now()) {}
  now() { return this.t; }
  advance(ms: number) { this.t += ms; }
}

export async function createApp(opts: { clock?: Clock; env?: Record<string, string> } = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'test', STORE_DRIVER: 'memory', ROUTING_DRIVER: 'mock', GEOCODER_DRIVER: 'memory', OTP_DEV_ECHO: 'true',
    ...opts.env,
  });
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (opts.clock) builder = builder.overrideProvider(CLOCK).useValue(opts.clock);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return app;
}

export async function guestToken(app: INestApplication): Promise<{ token: string; userId: string }> {
  const res = await request(app.getHttpServer()).post('/v1/auth/guest').expect(200);
  return { token: res.body.accessToken, userId: res.body.userId };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
