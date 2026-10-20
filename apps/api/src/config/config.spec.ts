import { loadConfig } from './config';

const TWILIO = { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15550000000' };

describe('config', () => {
  it('defaults to in-memory drivers in development', () => {
    const c = loadConfig({});
    expect(c.storeDriver).toBe('memory');
    expect(c.routingDriver).toBe('mock');
    expect(c.otpDevEcho).toBe(true);
  });

  it('refuses unsafe production config', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', STORE_DRIVER: 'memory', JWT_SECRET: 'x'.repeat(32), PHONE_PEPPER: 'p'.repeat(16) })).toThrow(/STORE_DRIVER/);
  });

  it('accepts a complete production config', () => {
    const c = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), PHONE_PEPPER: 'p'.repeat(16), KAFKA_BROKERS: 'a:9092, b:9092', ...TWILIO });
    expect(c.storeDriver).toBe('infra');
    expect(c.otpDevEcho).toBe(false);
    expect(c.kafkaBrokers).toEqual(['a:9092', 'b:9092']);
    expect(c.smsDriver).toBe('twilio');
    expect(c.jsonLogs).toBe(true);
  });

  it('requires Twilio credentials when SMS_DRIVER=twilio', () => {
    expect(() => loadConfig({ SMS_DRIVER: 'twilio' })).toThrow(/TWILIO_ACCOUNT_SID/);
    expect(loadConfig({ SMS_DRIVER: 'twilio', ...TWILIO }).twilio.from).toBe('+15550000000');
  });

  it('rejects unknown driver names', () => {
    expect(() => loadConfig({ ROUTING_DRIVER: 'osrm' })).toThrow(/ROUTING_DRIVER/);
  });
});
