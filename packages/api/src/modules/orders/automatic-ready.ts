import { OrderStatus, UserRole } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { emitOrderStatus } from '../../realtime';
import { DETAIL_INCLUDE } from './orders.service';
import { toOrderDetail } from './orders.mapper';
import { notifyStatusChange } from './status-notifications';

/** Compare-and-swap protects cancellation, changed timers and concurrent workers. */
export async function dispatchAutomaticReady(now = new Date(), assertActive: () => void = () => undefined): Promise<void> {
  const due = {
    status: { in: [OrderStatus.ACCEPTED, OrderStatus.PREPARING] },
    estimatedReadyAt: { lte: now }, changeProposal: null,
    store: { autoReadyOnPrepTimeout: true },
  };
  const candidates = await prisma.order.findMany({ where: due, take: 100,
    orderBy: { estimatedReadyAt: 'asc' }, select: { id: true, updatedAt: true } });
  for (const candidate of candidates) {
    assertActive();
    const ready = await prisma.$transaction(async tx => {
      const order = await tx.order.findFirst({ where: { ...due, ...candidate }, select: { status: true, store: { select: { managerId: true } } } });
      if (!order) return null;
      const changed = await tx.order.updateMany({ where: { ...due, ...candidate }, data: { status: OrderStatus.READY_FOR_PICKUP, preparedAt: now } });
      if (!changed.count) return null;
      // Acceptance starts the timer; retain the intermediate state in the audit trail.
      const states = order.status === OrderStatus.ACCEPTED
        ? [OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP] : [OrderStatus.READY_FOR_PICKUP];
      for (const status of states) await tx.orderStatusHistory.create({ data: {
        orderId: candidate.id, status, changedByUserId: order.store.managerId,
        note: 'تحديث تلقائي وفق إعداد المتجر عند انتهاء وقت التحضير', createdAt: now,
      } });
      return tx.order.findUniqueOrThrow({ where: { id: candidate.id }, include: DETAIL_INCLUDE });
    });
    if (!ready) continue;
    emitOrderStatus(ready.id, { orderId: ready.id, status: ready.status, timestamp: now.toISOString() });
    await notifyStatusChange(toOrderDetail(ready, UserRole.STORE_MANAGER), ready.id, ready.status);
  }
}
