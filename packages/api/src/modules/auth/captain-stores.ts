import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/http-error';
export const assignedStoresInclude = { assignedStores: { select: { id: true }, orderBy: { id: 'asc' as const } } };
export function captainStoreIds(captain: { assignedStoreId?: string | null; assignedStores?: { id: string }[] }): string[] {
  return captain.assignedStores?.length ? captain.assignedStores.map(store => store.id) : captain.assignedStoreId ? [captain.assignedStoreId] : [];
}
export async function validateCaptainStores(input: { assignedStoreIds?: string[]; assignedStoreId?: string | null }): Promise<string[] | undefined> {
  const ids = input.assignedStoreIds !== undefined ? [...new Set(input.assignedStoreIds)] : input.assignedStoreId !== undefined ? (input.assignedStoreId ? [input.assignedStoreId] : []) : undefined;
  if (ids === undefined) return undefined;
  for (const id of ids) {
    if (!await prisma.store.findUnique({ where: { id }, select: { id: true } })) throw notFound('المتجر غير موجود / Store not found');
  }
  return ids;
}
