import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * One PrismaClient for the process. `tsx watch` re-evaluates modules on every
 * save, so in development the instance is cached on `globalThis` to avoid
 * exhausting the PostgreSQL connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProduction ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
