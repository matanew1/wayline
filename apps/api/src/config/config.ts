export type StoreDriver = 'memory' | 'infra';
export type RoutingDriver = 'mock' | 'valhalla';
export type GeocoderDriver = 'memory' | 'photon' | 'pelias';
export type SmsDriver = 'log' | 'twilio';

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  /** memory = everything in-process (dev/tests); infra = Postgres + Redis + Kafka */
  storeDriver: StoreDriver;
  routingDriver: RoutingDriver;
  geocoderDriver: GeocoderDriver;
  jwtSecret: string;
  accessTtlS: number;
  refreshTtlS: number;
  /** Secret mixed into phone hashes so a DB dump does not reveal phone numbers. */
  phonePepper: string;
  /** Return the OTP in the API response. Never allowed in production. */
  otpDevEcho: boolean;
  databaseUrl: string;
  redisUrl: string;
  kafkaBrokers: string[];
  valhallaUrl: string;
  geocoderUrl: string;
  corsOrigins: string[] | true;
  smsDriver: SmsDriver;
  twilio: { accountSid: string; authToken: string; from?: string; messagingServiceSid?: string };
  /** Expose GET /metrics (Prometheus). Protect it at the ingress. */
  metricsEnabled: boolean;
  /** JSON log lines (one object per line) — on by default in production. */
  jsonLogs: boolean;
  /** Optional fixed sign-in for App Store / Play review: this number accepts this code, no SMS sent. */
  review: { phone: string; code: string } | null;
  /** Public base URL of this API (for share links). Unset → taken from the request. */
  publicUrl: string | null;
  map: {
    /** TileJSON URL of our vector tiles (Martin), e.g. https://tiles.example.com/israel. Unset → fallbackTilesUrl. */
    tilesUrl: string | null;
    glyphsUrl: string;
    /** Public OpenMapTiles-schema tiles used until our own are deployed (OpenFreeMap, no key). */
    fallbackTilesUrl: string;
    /** Where style.template.json lives. */
    styleDir: string;
  };
}

const DEV_SECRET = 'dev-only-secret-change-me';

function oneOf<T extends string>(name: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  const v = (value ?? fallback) as T;
  if (!allowed.includes(v)) {
    throw new Error(`${name} must be one of ${allowed.join(', ')} (got "${value}")`);
  }
  return v;
}

function int(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = oneOf('NODE_ENV', env.NODE_ENV, ['development', 'test', 'production'] as const, 'development');
  const prod = nodeEnv === 'production';

  const config: AppConfig = {
    env: nodeEnv,
    port: int('PORT', env.PORT, 3000),
    storeDriver: oneOf('STORE_DRIVER', env.STORE_DRIVER, ['memory', 'infra'] as const, prod ? 'infra' : 'memory'),
    routingDriver: oneOf('ROUTING_DRIVER', env.ROUTING_DRIVER, ['mock', 'valhalla'] as const, prod ? 'valhalla' : 'mock'),
    geocoderDriver: oneOf('GEOCODER_DRIVER', env.GEOCODER_DRIVER, ['memory', 'photon', 'pelias'] as const, prod ? 'photon' : 'memory'),
    jwtSecret: env.JWT_SECRET ?? DEV_SECRET,
    accessTtlS: int('JWT_ACCESS_TTL_S', env.JWT_ACCESS_TTL_S, 15 * 60),
    refreshTtlS: int('JWT_REFRESH_TTL_S', env.JWT_REFRESH_TTL_S, 30 * 24 * 3600),
    phonePepper: env.PHONE_PEPPER ?? 'dev-pepper',
    otpDevEcho: env.OTP_DEV_ECHO ? env.OTP_DEV_ECHO === 'true' : !prod,
    databaseUrl: env.DATABASE_URL ?? 'postgres://wayline:wayline@localhost:5432/wayline',
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    kafkaBrokers: (env.KAFKA_BROKERS ?? 'localhost:19092').split(',').map((s) => s.trim()).filter(Boolean),
    valhallaUrl: (env.VALHALLA_URL ?? 'http://localhost:8002').replace(/\/$/, ''),
    geocoderUrl: (env.GEOCODER_URL ?? 'https://photon.komoot.io').replace(/\/$/, ''),
    corsOrigins: env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((s) => s.trim()) : true,
    smsDriver: oneOf('SMS_DRIVER', env.SMS_DRIVER, ['log', 'twilio'] as const, prod ? 'twilio' : 'log'),
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID ?? '',
      authToken: env.TWILIO_AUTH_TOKEN ?? '',
      from: env.TWILIO_FROM || undefined,
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID || undefined,
    },
    metricsEnabled: env.METRICS_ENABLED ? env.METRICS_ENABLED === 'true' : true,
    jsonLogs: env.LOG_FORMAT ? env.LOG_FORMAT === 'json' : prod,
    review: env.REVIEW_PHONE && env.REVIEW_CODE ? { phone: env.REVIEW_PHONE, code: env.REVIEW_CODE } : null,
    publicUrl: env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/$/, '') : null,
    map: {
      tilesUrl: env.MAP_TILES_URL || null,
      glyphsUrl: env.MAP_GLYPHS_URL ?? 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      fallbackTilesUrl: env.MAP_FALLBACK_TILES_URL ?? 'https://tiles.openfreemap.org/planet',
      styleDir: env.MAP_STYLE_DIR ?? require('node:path').resolve(__dirname, '../../../../infra/map-data'),
    },
  };
  if (config.review && !/^\d{6}$/.test(config.review.code)) throw new Error('REVIEW_CODE must be 6 digits');
  const t = config.twilio;
  const twilioMissing = config.smsDriver === 'twilio' && (!t.accountSid || !t.authToken || (!t.from && !t.messagingServiceSid));
  const twilioMsg = 'SMS_DRIVER=twilio needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID';
  if (twilioMissing && !prod) throw new Error(twilioMsg);

  if (prod) {
    const problems: string[] = [];
    if (config.storeDriver !== 'infra') problems.push('STORE_DRIVER must be "infra"');
    if (config.routingDriver !== 'valhalla') problems.push('ROUTING_DRIVER must be "valhalla"');
    if (config.geocoderDriver === 'memory') problems.push('GEOCODER_DRIVER must not be "memory"');
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be set (≥ 32 chars)');
    if (!env.PHONE_PEPPER || env.PHONE_PEPPER.length < 16) problems.push('PHONE_PEPPER must be set (≥ 16 chars)');
    if (config.otpDevEcho) problems.push('OTP_DEV_ECHO must be false');
    if (twilioMissing) problems.push(twilioMsg);
    if (config.smsDriver === 'log') problems.push('SMS_DRIVER must not be "log" (codes would only be logged)');
    if (problems.length) throw new Error(`Invalid production config:\n - ${problems.join('\n - ')}`);
  }
  return config;
}
