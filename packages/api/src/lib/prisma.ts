import type { PrismaClient as SqlitePrismaClient } from '../../generated/prisma-sqlite';
import { env } from '../config/env';
import { PrismaClient } from './prisma-runtime';

/**
 * One PrismaClient for the process. `tsx watch` re-evaluates modules on every
 * save, so in development the instance is cached on `globalThis` to avoid
 * exhausting the SQLite connection pool.
 *
 * The concrete client class comes from `prisma-runtime`, which selects between
 * the independently generated SQLite and PostgreSQL clients based on the
 * environment — so `db:generate` / `db:generate:prod` can never overwrite the
 * other provider's generated output.
 */
const globalForPrisma = globalThis as unknown as { prisma?: SqlitePrismaClient };

/**
 * The two generated clients are structurally identical for the models; their
 * constructor types only differ in Prisma's internal generics, so the
 * environment-selected constructor is cast to the SQLite constructor here.
 * `new PrismaClientCtor(...)` constructs the runtime client of the active
 * datasource (SQLite in dev/test, PostgreSQL in production).
 */
const PrismaClientCtor = PrismaClient as typeof SqlitePrismaClient;

export const prisma: SqlitePrismaClient =
  globalForPrisma.prisma ??
  new PrismaClientCtor({
    log: env.isProduction ? ['warn', 'error'] : ['warn', 'error'],
  });

/**
 * Active database provider of the generated client (`sqlite` locally, Postgres
 * in production). Read off the engine config because Prisma exposes no public
 * typed accessor for it.
 */
const activeProvider = (prisma as unknown as { _engineConfig: { activeProvider?: string } })
  ._engineConfig.activeProvider;

export const isPostgresProvider = activeProvider === 'postgresql';

/**
 * Case-insensitive `contains` filter. `mode: 'insensitive'` is a Postgres-only
 * feature — the SQLite client rejects it at the type level and at runtime, and
 * SQLite's LIKE is already case-insensitive for ASCII. Keeps search semantics
 * equivalent on both providers.
 */
export function caseInsensitiveContains(value: string): { contains: string; mode?: 'insensitive' } {
  return isPostgresProvider
    ? { contains: value, mode: 'insensitive' }
    : { contains: value };
}

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
