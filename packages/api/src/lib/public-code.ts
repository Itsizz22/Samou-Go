import { prisma } from './prisma';
import type { Prisma } from './prisma-types';

/** Atomic allocator; gaps after rejected creations are intentional. */
export async function nextPublicCode(role: string, db: Pick<Prisma.TransactionClient, 'referenceSequence'> = prisma): Promise<string> {
  const prefix = ({ CUSTOMER: 'C', CAPTAIN: 'D', STORE_MANAGER: 'M', ADMIN: 'A', STORE: 'S' } as Record<string, string>)[role];
  if (!prefix) throw new Error('Unsupported reference role');
  const counter = await db.referenceSequence.upsert({ where: { prefix }, create: { prefix, value: 10001 }, update: { value: { increment: 1 } } });
  return `${prefix}-${counter.value}`;
}
