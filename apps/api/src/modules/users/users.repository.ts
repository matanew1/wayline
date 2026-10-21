import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { clampTrust } from '../reports/report.rules';

export interface User {
  id: string;
  phoneHash: string | null;
  displayName: string | null;
  isGuest: boolean;
  /** 0..1 — grows with confirmed reports, used to weight new reports. */
  trustScore: number;
  createdAt: Date;
}

export interface UsersRepository {
  findOrCreateByPhoneHash(phoneHash: string): Promise<User>;
  createGuest(): Promise<User>;
  findById(id: string): Promise<User | null>;
  /** Adds delta to trust_score, clamped (guests have a lower cap). Returns the new score. */
  adjustTrust(id: string, delta: number): Promise<number | null>;
  /** Removes the user; votes cascade, reports keep their history with reporter_id set to NULL. */
  delete(id: string): Promise<boolean>;
}

export class MemoryUsersRepository implements UsersRepository {
  private readonly byId = new Map<string, User>();

  async findOrCreateByPhoneHash(phoneHash: string) {
    for (const u of this.byId.values()) if (u.phoneHash === phoneHash) return u;
    return this.insert({ phoneHash, isGuest: false });
  }
  async createGuest() { return this.insert({ phoneHash: null, isGuest: true }); }
  async findById(id: string) { return this.byId.get(id) ?? null; }
  async adjustTrust(id: string, delta: number) {
    const u = this.byId.get(id);
    if (!u) return null;
    u.trustScore = clampTrust(u.trustScore + delta, u.isGuest);
    return u.trustScore;
  }

  async delete(id: string) {
    return this.byId.delete(id);
  }

  private insert(p: { phoneHash: string | null; isGuest: boolean }): User {
    const u: User = { id: randomUUID(), displayName: null, trustScore: p.isGuest ? 0.3 : 0.5, createdAt: new Date(), ...p };
    this.byId.set(u.id, u);
    return u;
  }
}

type Row = { id: string; phone_hash: string | null; display_name: string | null; is_guest: boolean; trust_score: number; created_at: Date };
const map = (r: Row): User => ({
  id: r.id, phoneHash: r.phone_hash, displayName: r.display_name, isGuest: r.is_guest, trustScore: Number(r.trust_score), createdAt: r.created_at,
});

export class PgUsersRepository implements UsersRepository {
  constructor(private readonly pg: Pool) {}

  async findOrCreateByPhoneHash(phoneHash: string) {
    const { rows } = await this.pg.query<Row>(
      `INSERT INTO users (phone_hash) VALUES ($1)
       ON CONFLICT (phone_hash) DO UPDATE SET phone_hash = EXCLUDED.phone_hash
       RETURNING *`,
      [phoneHash],
    );
    return map(rows[0]);
  }
  async createGuest() {
    const { rows } = await this.pg.query<Row>(`INSERT INTO users (is_guest, trust_score) VALUES (true, 0.3) RETURNING *`);
    return map(rows[0]);
  }
  async findById(id: string) {
    const { rows } = await this.pg.query<Row>(`SELECT * FROM users WHERE id = $1`, [id]);
    return rows[0] ? map(rows[0]) : null;
  }
  async adjustTrust(id: string, delta: number) {
    const { rows } = await this.pg.query<{ trust_score: number }>(
      `UPDATE users SET trust_score = LEAST(CASE WHEN is_guest THEN 0.5 ELSE 1 END, GREATEST(0, trust_score + $2))
       WHERE id = $1 RETURNING trust_score`,
      [id, delta],
    );
    return rows[0] ? Number(rows[0].trust_score) : null;
  }
  async delete(id: string) {
    const res = await this.pg.query(`DELETE FROM users WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
