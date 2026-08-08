import type { FavoriteListResult } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/http-error';
import { toStore } from '../stores/stores.mapper';

/**
 * The signed-in customer's favorited stores, newest first.
 * Un-approved or closed stores are still listed — the UI can badge them.
 */
export async function listFavorites(userId: string): Promise<FavoriteListResult> {
  const rows = await prisma.favorite.findMany({
    where: { userId },
    include: { store: true },
    orderBy: { createdAt: 'desc' },
  });
  return { items: rows.map(row => toStore(row.store)) };
}

/** Idempotent add — safe to call twice. */
export async function addFavorite(userId: string, storeId: string): Promise<void> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw notFound('المتجر غير موجود / Store not found');
  await prisma.favorite.upsert({
    where: { userId_storeId: { userId, storeId } },
    create: { userId, storeId },
    update: {},
  });
}

/** Idempotent remove. */
export async function removeFavorite(userId: string, storeId: string): Promise<void> {
  await prisma.favorite.deleteMany({ where: { userId, storeId } });
}
