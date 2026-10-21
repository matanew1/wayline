// Tracing must patch modules before anything else loads them.
import './observability/tracing';
import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import type { AppConfig } from './config/config';
import { CONFIG } from './common/tokens';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

async function main() {
  const json = process.env.LOG_FORMAT ? process.env.LOG_FORMAT === 'json' : process.env.NODE_ENV === 'production';
  const app = await NestFactory.create(AppModule, { logger: new ConsoleLogger({ json, colors: !json }) });
  const config = app.get<AppConfig>(CONFIG);

  if (config.storeDriver === 'infra') {
    const io = new RedisIoAdapter(app, config.redisUrl);
    await io.connect();
    app.useWebSocketAdapter(io);
  }
  configureApp(app);
  await app.listen(config.port, '0.0.0.0');

  Logger.log(
    `Wayline API on :${config.port} — store=${config.storeDriver} routing=${config.routingDriver} geocoder=${config.geocoderDriver} — docs at /docs`,
    'Bootstrap',
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
