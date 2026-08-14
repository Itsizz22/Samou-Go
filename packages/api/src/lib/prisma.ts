import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Single PrismaClient instance across the process.
 * In development, `tsx watch` re-evaluates modules on save, so we cache
 * the instance on `globalThis` to prevent connection pool exhaustion.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProduction ? ['warn', 'error'] : ['query', 'info', 'warn', 'error'],
  });

export const isPostgresProvider = true;

/**
 * Case-insensitive `contains` filter for Postgres queries.
 */
export function caseInsensitiveContains(value: string): { contains: string; mode: 'insensitive' } {
  return { contains: value, mode: 'insensitive' };
}

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}