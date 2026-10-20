import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dump } from 'js-yaml';

process.env.STORE_DRIVER = 'memory';
process.env.ROUTING_DRIVER = 'mock';
process.env.GEOCODER_DRIVER = 'memory';
process.env.NODE_ENV = 'development';

async function run() {
  const { AppModule } = await import('../app.module');
  const { configureApp } = await import('../bootstrap');
  const app = await NestFactory.create(AppModule, { logger: false });
  const doc = configureApp(app);
  const out = resolve(process.argv[2] ?? 'openapi.yaml');
  writeFileSync(out, dump(doc, { noRefs: true, lineWidth: 120 }));
  await app.close();
  // eslint-disable-next-line no-console
  console.log(`wrote ${out}`);
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
