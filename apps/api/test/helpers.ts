import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { CLOCK, Clock } from '../src/common/tokens';
import { AuthService } from '../src/modules/auth/auth.service';

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

/**
 * A fresh guest user. Goes through AuthService directly so tests that need many users don't trip
 * the per-IP rate limit on POST /auth/guest (that endpoint has its own HTTP tests).
 */
export async function guestToken(app: INestApplication): Promise<{ token: string; userId: string }> {
  const t = await app.get(AuthService).guest();
  return { token: t.accessToken, userId: t.userId };
}

export async function guestTokenViaHttp(app: INestApplication): Promise<{ token: string; userId: string }> {
  const res = await request(app.getHttpServer()).post('/v1/auth/guest').expect(200);
  return { token: res.body.accessToken, userId: res.body.userId };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
