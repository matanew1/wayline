import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import type { AppConfig } from './config/config';
import { CONFIG } from './common/tokens';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

async function main() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
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
