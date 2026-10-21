import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type { AppConfig } from './config/config';
import { CONFIG } from './common/tokens';

/** Shared by main.ts, e2e tests and the OpenAPI exporter so they all see the same app. */
export function configureApp(app: INestApplication): OpenAPIObject {
  const config = app.get<AppConfig>(CONFIG);
  app.setGlobalPrefix('v1', { exclude: [
    { path: 'health', method: RequestMethod.GET },
    { path: 'health/live', method: RequestMethod.GET },
    { path: 'metrics', method: RequestMethod.GET },
    { path: 'privacy', method: RequestMethod.GET },
    { path: 'delete-account', method: RequestMethod.GET },
  ] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: config.corsOrigins });
  app.enableShutdownHooks();

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Wayline API')
      .setDescription('Community-powered navigation. Realtime events: Socket.IO namespace /rt (see RealtimeGateway).')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, doc);
  return doc;
}
