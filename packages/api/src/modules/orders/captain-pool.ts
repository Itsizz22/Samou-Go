import { captainStoreIds, assignedStoresInclude } from '../auth/captain-stores';
import { MAX_ACTIVE_CAPTAIN_ORDERS, OrderStatus, UserRole } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { conflict, forbidden } from '../../lib/http-error';
import type { Prisma } from '../../lib/prisma-types';

export const ACTIVE_CAPTAIN_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ON_THE_WAY];

/** All assignment paths lock the same user row before checking capacity. */
export async function lockCaptainCapacity(tx: Prisma.TransactionClient, captainId: string, orderId: string): Promise<void> {
  const locked = await tx.user.updateMany({ where: { id: captainId, role: UserRole.CAPTAIN, isActive: true, isVerified: true, isAvailable: true }, data: { updatedAt: new Date() } });
  if (!locked.count) throw forbidden('الكابتن غير متاح / Captain unavailable');
  const activeCount = await tx.order.count({ where: { captainId, id: { not: orderId }, status: { in: ACTIVE_CAPTAIN_STATUSES } } });
  if (activeCount >= MAX_ACTIVE_CAPTAIN_ORDERS) throw conflict('وصل الكابتن إلى الحد الأقصى: 3 طلبات نشطة / Captain has reached the limit of 3 active orders');
  if (activeCount >= 2) {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { storeId: true, dispatchCaptainId: true, dispatchExpiresAt: true } });
    // Honor a still-valid exclusive offer; its priority was checked when it was issued.
    if (order?.dispatchCaptainId === captainId && order.dispatchExpiresAt && order.dispatchExpiresAt > new Date()) return;
    if (order) {
      const expiredCaptain = order.dispatchExpiresAt && order.dispatchExpiresAt <= new Date() ? order.dispatchCaptainId : null;
      const pressure = await storeDispatchPressure(order.storeId, tx, expiredCaptain);
      if (pressure.active && pressure.minimumLoad < activeCount) {
        throw conflict('وقت الضغط: الأولوية لسائق أقل انشغالًا قبل قبول طلب ثالث / During peak demand, a less busy captain has priority over a third order');
      }
    }
  }
}

export const PREPARATION_POOL_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP];

export async function captainPoolScope(captainId: string): Promise<Prisma.OrderWhereInput> {
  const captain = await prisma.user.findUnique({ where: { id: captainId }, select: { role: true, isActive: true, isVerified: true, isAvailable: true, assignedStoreId: true, captainOrders: { where: { status: { in: ACTIVE_CAPTAIN_STATUSES } }, select: { id: true }, take: MAX_ACTIVE_CAPTAIN_ORDERS }, ...assignedStoresInclude } });
  if (!captain || captain.role !== UserRole.CAPTAIN || !captain.isActive || !captain.isVerified || !captain.isAvailable || captain.captainOrders.length >= MAX_ACTIVE_CAPTAIN_ORDERS) return { id: '__no_match__' };
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
    blockedStores: { none: { id: storeId } },
    OR: [{ AND: [{ assignedStores: { none: {} } }, { assignedStoreId: null }] }, { assignedStores: { some: { id: storeId } } }, { assignedStoreId: storeId }],
    ...(dedicated.length ? { id: { in: dedicated } } : {}),
  }, select: { id: true, captainOrders: { where: { status: { in: ACTIVE_CAPTAIN_STATUSES } }, select: { id: true }, take: MAX_ACTIVE_CAPTAIN_ORDERS } } });
  return users.filter(c => includeBusy || c.captainOrders.length < MAX_ACTIVE_CAPTAIN_ORDERS).map(c => c.id);
}

/** Pressure is local to the store's eligible fleet, not unrelated stores or offline drivers. */
export async function storeDispatchPressure(storeId: string, db: Prisma.TransactionClient = prisma, expiredCaptain: string | null = null): Promise<{ active: boolean; minimumLoad: number }> {
  const eligible = await eligibleCaptainIds(storeId, db);
  // One unanswered offer must not block every other captain from taking the order.
  const alternatives = eligible.filter(id => id !== expiredCaptain);
  const ids = alternatives.length ? alternatives : eligible;
  if (!ids.length) return { active: false, minimumLoad: MAX_ACTIVE_CAPTAIN_ORDERS };
  const waiting = await db.order.count({ where: { storeId, captainId: null, fulfillmentType: 'DELIVERY', changeProposal: null, status: { in: PREPARATION_POOL_STATUSES } } });
  if (waiting < Math.max(3, ids.length)) return { active: false, minimumLoad: MAX_ACTIVE_CAPTAIN_ORDERS };
  const captains = await db.user.findMany({ where: { id: { in: ids } }, select: { captainOrders: { where: { status: { in: ACTIVE_CAPTAIN_STATUSES } }, select: { id: true }, take: MAX_ACTIVE_CAPTAIN_ORDERS } } });
  return { active: true, minimumLoad: Math.min(...captains.map(captain => captain.captainOrders.length)) };
}
