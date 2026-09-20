import { createHmac } from 'node:crypto';
import type { Store, Options, IncrementResponse } from 'express-rate-limit';
import { prisma } from './prisma';
import { env } from '../config/env';
import { serviceUnavailable } from './http-error';

export type CoordinationDb = Pick<typeof prisma, '$queryRaw' | '$executeRaw'>;

/** Atomic database-clock windows work through pooled Postgres connections. */
export class PostgresRateLimitStore implements Store {
  readonly localKeys = false;
  private windowMs = 60_000;
  constructor(readonly prefix: string, private readonly db: CoordinationDb = prisma,
    private readonly secret = env.jwt.secret) {}

  init(options: Options): void { this.windowMs = options.windowMs; }
  private id(key: string): string {
    return `${this.prefix}:${createHmac('sha256', this.secret).update(key).digest('hex')}`;
  }
  async increment(key: string): Promise<IncrementResponse> {
    try {
      const rows = await this.db.$queryRaw<Array<{ hits: number; resetAt: Date }>>`
        INSERT INTO shared_rate_limits (id, hits, reset_at)
        VALUES (${this.id(key)}, 1, statement_timestamp() + ${this.windowMs} * interval '1 millisecond')
        ON CONFLICT (id) DO UPDATE SET
          hits = CASE WHEN shared_rate_limits.reset_at <= statement_timestamp() THEN 1
                 ELSE LEAST(shared_rate_limits.hits::bigint + 1, 2147483647)::integer END,
          reset_at = CASE WHEN shared_rate_limits.reset_at <= statement_timestamp()
                     THEN statement_timestamp() + ${this.windowMs} * interval '1 millisecond'
                     ELSE shared_rate_limits.reset_at END
        RETURNING hits, reset_at AS "resetAt"`;
      if (!rows[0]) throw new Error('Missing rate-limit result');
      return { totalHits: rows[0].hits, resetTime: rows[0].resetAt };
    } catch {
      // Never silently bypass protection or switch to a per-replica quota.
      throw serviceUnavailable('RATE_LIMIT_UNAVAILABLE', 'الحماية مشغولة مؤقتًا / Protection temporarily unavailable');
    }
  }
  async decrement(key: string): Promise<void> {
    await this.db.$executeRaw`UPDATE shared_rate_limits SET hits = GREATEST(hits - 1, 0) WHERE id = ${this.id(key)}`;
  }
  async resetKey(key: string): Promise<void> {
    await this.db.$executeRaw`DELETE FROM shared_rate_limits WHERE id = ${this.id(key)}`;
  }
}

export function sharedRateLimitStore(prefix: string): Store | undefined {
  return env.isProduction ? new PostgresRateLimitStore(prefix) : undefined;
}

/** Bounded cleanup using the expiry index, safe alongside concurrent increments. */
export async function cleanupSharedRateLimits(db: CoordinationDb = prisma): Promise<void> {
  await db.$executeRaw`DELETE FROM shared_rate_limits WHERE id IN (
    SELECT id FROM shared_rate_limits WHERE reset_at < statement_timestamp() - interval '1 minute'
    ORDER BY reset_at LIMIT 1000
  ) AND reset_at < statement_timestamp() - interval '1 minute'`;
}
