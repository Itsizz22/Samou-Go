import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { prisma } from './prisma';
import { env } from '../config/env';
import type { CoordinationDb } from './shared-rate-limit';

const LEASE_MS = 120_000;
export class PostgresJobLease {
  constructor(private readonly db: CoordinationDb = prisma) {}
  async acquire(id: string, owner: string, ttlMs = LEASE_MS): Promise<boolean> {
    const rows = await this.db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO background_job_leases (id, owner, expires_at)
      VALUES (${id}, ${owner}, statement_timestamp() + ${ttlMs} * interval '1 millisecond')
      ON CONFLICT (id) DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
      WHERE background_job_leases.expires_at <= statement_timestamp()
      RETURNING id`;
    return rows.length === 1;
  }
  async renew(id: string, owner: string, ttlMs = LEASE_MS): Promise<boolean> {
    return (await this.db.$executeRaw`UPDATE background_job_leases
      SET expires_at = statement_timestamp() + ${ttlMs} * interval '1 millisecond'
      WHERE id = ${id} AND owner = ${owner} AND expires_at > statement_timestamp()`) === 1;
  }
  async release(id: string, owner: string): Promise<void> {
    await this.db.$executeRaw`DELETE FROM background_job_leases WHERE id = ${id} AND owner = ${owner}`;
  }
}

/** Cooperative cancellation plus existing per-order claims fence work on lease loss.
 * External push delivery is retryable, not an exactly-once transaction. */
export async function withJobLease(id: string, work: (assertActive: () => void) => Promise<void>): Promise<boolean> {
  if (!env.isProduction) { await work(() => undefined); return true; }
  const lease = new PostgresJobLease();
  const owner = randomUUID();
  let validUntil = performance.now() + LEASE_MS;
  if (!await lease.acquire(id, owner)) return false;
  let lost = false;
  let renewal: Promise<void> | null = null;
  const assertActive = () => {
    if (lost || performance.now() >= validUntil) throw new Error('Background job ownership lost');
  };
  const timer = setInterval(() => {
    if (renewal || lost) return;
    const started = performance.now();
    renewal = lease.renew(id, owner).then(ok => {
      if (!ok) lost = true;
      else validUntil = started + LEASE_MS;
    }).catch(() => { lost = true; }).finally(() => { renewal = null; });
  }, 20_000);
  timer.unref();
  try {
    assertActive();
    await work(assertActive);
    assertActive();
    return true;
  } finally {
    clearInterval(timer);
    await renewal;
    await lease.release(id, owner);
  }
}
