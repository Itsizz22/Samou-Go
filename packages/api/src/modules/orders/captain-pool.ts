import { captainStoreIds, assignedStoresInclude } from '../auth/captain-stores';
import { OrderStatus, UserRole } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import type { Prisma } from '../../lib/prisma-types';

export const PREPARATION_POOL_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP];

export async function captainPoolScope(captainId: string): Promise<Prisma.OrderWhereInput> {
  const captain = await prisma.user.findUnique({ where: { id: captainId }, select: { role: true, isActive: true, isVerified: true, isAvailable: true, assignedStoreId: true, ...assignedStoresInclude } });
  if (!captain || captain.role !== UserRole.CAPTAIN || !captain.isActive || !captain.isVerified || !captain.isAvailable) return { id: '__no_match__' };
  return {
    status: { in: PREPARATION_POOL_STATUSES }, fulfillmentType: 'DELIVERY',
    ...(captainStoreIds(captain).length ? { storeId: { in: captainStoreIds(captain) } } : {}),
    store: { OR: [{ AND: [{ dedicatedCaptains: { none: {} } }, { legacyDedicatedCaptains: { none: {} } }] }, { dedicatedCaptains: { some: { id: captainId } } }, { legacyDedicatedCaptains: { some: { id: captainId } } }] },
  };
}

export async function eligibleCaptainIds(storeId: string): Promise<string[]> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { dedicatedCaptains: { select: { id: true } }, legacyDedicatedCaptains: { select: { id: true } } } });
  if (!store) return [];
  const dedicated = [...new Set([...store.dedicatedCaptains, ...(store.legacyDedicatedCaptains ?? [])].map(c => c.id))];
  const users = await prisma.user.findMany({ where: {
    role: UserRole.CAPTAIN, isActive: true, isVerified: true, isAvailable: true,
    OR: [{ AND: [{ assignedStores: { none: {} } }, { assignedStoreId: null }] }, { assignedStores: { some: { id: storeId } } }, { assignedStoreId: storeId }],
    ...(dedicated.length ? { id: { in: dedicated } } : {}),
  }, select: { id: true } });
  return users.map(c => c.id);
}
