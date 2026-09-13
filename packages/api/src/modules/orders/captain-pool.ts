import { captainStoreIds, assignedStoresInclude } from '../auth/captain-stores';
import { OrderStatus, UserRole } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { conflict, forbidden } from '../../lib/http-error';
import type { Prisma } from '../../lib/prisma-types';

export const ACTIVE_CAPTAIN_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ON_THE_WAY];

/** All assignment paths lock the same user row before checking capacity. */
export async function lockCaptainCapacity(tx: Prisma.TransactionClient, captainId: string, orderId: string): Promise<void> {
  const locked = await tx.user.updateMany({ where: { id: captainId, role: UserRole.CAPTAIN, isActive: true, isVerified: true, isAvailable: true }, data: { updatedAt: new Date() } });
  if (!locked.count) throw forbidden('الكابتن غير متاح / Captain unavailable');
  if (await tx.order.count({ where: { captainId, id: { not: orderId }, status: { in: ACTIVE_CAPTAIN_STATUSES } } })) throw conflict('لدى الكابتن طلب نشط / Captain already has an active order');
}

export const PREPARATION_POOL_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP];

export async function captainPoolScope(captainId: string): Promise<Prisma.OrderWhereInput> {
  const captain = await prisma.user.findUnique({ where: { id: captainId }, select: { role: true, isActive: true, isVerified: true, isAvailable: true, assignedStoreId: true, captainOrders: { where: { status: { in: ACTIVE_CAPTAIN_STATUSES } }, select: { id: true }, take: 1 }, ...assignedStoresInclude } });
  if (!captain || captain.role !== UserRole.CAPTAIN || !captain.isActive || !captain.isVerified || !captain.isAvailable || captain.captainOrders.length > 0) return { id: '__no_match__' };
  return {
    status: { in: PREPARATION_POOL_STATUSES }, fulfillmentType: 'DELIVERY', captainId: null, changeProposal: null,
    OR: [{ dispatchCaptainId: null }, { dispatchCaptainId: captainId, dispatchExpiresAt: { gt: new Date() } }],
    NOT: { storeId: { in: captain.blockedStores?.map(store => store.id) ?? [] } },
    ...(captainStoreIds(captain).length ? { storeId: { in: captainStoreIds(captain) } } : {}),
    store: { OR: [{ AND: [{ dedicatedCaptains: { none: {} } }, { legacyDedicatedCaptains: { none: {} } }] }, { dedicatedCaptains: { some: { id: captainId } } }, { legacyDedicatedCaptains: { some: { id: captainId } } }] },
  };
}

export async function eligibleCaptainIds(storeId: string, db: Prisma.TransactionClient = prisma, includeBusy = false): Promise<string[]> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { dedicatedCaptains: { select: { id: true } }, legacyDedicatedCaptains: { select: { id: true } } } });
  if (!store) return [];
  const dedicated = [...new Set([...store.dedicatedCaptains, ...(store.legacyDedicatedCaptains ?? [])].map(c => c.id))];
  const users = await db.user.findMany({ where: {
    role: UserRole.CAPTAIN, isActive: true, isVerified: true, isAvailable: true,
    ...(!includeBusy ? { captainOrders: { none: { status: { in: ACTIVE_CAPTAIN_STATUSES } } } } : {}),
    blockedStores: { none: { id: storeId } },
    OR: [{ AND: [{ assignedStores: { none: {} } }, { assignedStoreId: null }] }, { assignedStores: { some: { id: storeId } } }, { assignedStoreId: storeId }],
    ...(dedicated.length ? { id: { in: dedicated } } : {}),
  }, select: { id: true } });
  return users.map(c => c.id);
}
