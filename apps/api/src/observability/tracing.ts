/**
 * OpenTelemetry tracing. Imported first in main.ts so instrumentations patch http, express,
 * pg, ioredis, kafkajs and socket.io before they load. Off unless an OTLP endpoint is set:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318  OTEL_SERVICE_NAME=wayline-api
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;

export function startTracing(): boolean {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT || sdk) return false;
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'wayline-api',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.1.0',
    }),
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // noisy and low-value
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        // health/metrics probes would dominate traces
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => /^\/(health|metrics)/.test(req.url ?? ''),
        },
      }),
    ],
  });
  sdk.start();
  const stop = () => { void sdk?.shutdown(); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return true;
}

startTracing();
