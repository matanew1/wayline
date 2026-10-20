import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

/**
 * Minimal forward-only migrator: applies infra/sql/NNN_*.sql in order, once each,
 * inside a transaction, tracked in schema_migrations. Uses an advisory lock so
 * parallel pods (k8s Job + rollout) can't race.
 */
export async function migrate(databaseUrl: string, dir: string, log: (m: string) => void = console.log) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      log(`applying ${f}`);
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(join(dir, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`${f}: ${(e as Error).message}`);
      }
    }
    log(`migrations up to date (${files.length} files)`);
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    await client.end();
  }
}

if (require.main === module) {
  const dir = process.env.MIGRATIONS_DIR ?? resolve(__dirname, '../../../../infra/sql');
  migrate(process.env.DATABASE_URL ?? 'postgres://wayline:wayline@localhost:5432/wayline', dir).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
