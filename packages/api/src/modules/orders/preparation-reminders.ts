import { OrderStatus } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { sendPushToMany } from '../../lib/push';
import { eligibleCaptainIds } from './captain-pool';

const preparing = [OrderStatus.ACCEPTED, OrderStatus.PREPARING];
/** Durable due time and lease survive process restarts and coordinate multiple API replicas. */
export async function dispatchPreparationReminders(now = new Date()): Promise<void> {
  const settings = await prisma.platformSettings.findUnique({ where: { id: 'platform' }, select: { preparationReminderMinutes: true } });
  const lead = settings?.preparationReminderMinutes ?? 5;
  const orders = await prisma.order.findMany({ where: {
    fulfillmentType: 'DELIVERY', status: { in: preparing }, prepReminderSentAt: null,
    estimatedReadyAt: { gt: now, lte: new Date(now.getTime() + lead * 60_000) },
    OR: [{ prepReminderLeaseUntil: null }, { prepReminderLeaseUntil: { lt: now } }],
  }, orderBy: { estimatedReadyAt: 'asc' }, take: 100, select: { id: true, estimatedReadyAt: true, captainId: true } });
  for (const candidate of orders) {
    const lease = new Date(now.getTime() + 120_000);
    const version = { id: candidate.id, estimatedReadyAt: candidate.estimatedReadyAt, captainId: candidate.captainId };
    const claimed = await prisma.order.updateMany({ where: {
      ...version, status: { in: preparing }, prepReminderSentAt: null,
      OR: [{ prepReminderLeaseUntil: null }, { prepReminderLeaseUntil: { lt: now } }],
    }, data: { prepReminderLeaseUntil: lease } });
    if (!claimed.count) continue;
    try {
      // Recheck after acquiring the lease: cancellation, rescheduling and assignment invalidate it.
      const order = await prisma.order.findFirst({ where: { ...version, prepReminderLeaseUntil: lease, status: { in: preparing } }, include: { store: { select: { nameAr: true } } } });
      if (!order?.estimatedReadyAt) continue;
      const minutes = Math.ceil((order.estimatedReadyAt.getTime() - Date.now()) / 60_000);
      if (minutes <= 0) continue;
      const recipients = order.captainId ? [order.captainId] : await eligibleCaptainIds(order.storeId);
      if (!recipients.length) continue;
      const result = await sendPushToMany(recipients, {
        title: order.captainId ? 'اقترب موعد استلام طلبك ⏱️' : 'طلب متاح يقترب من الجاهزية ⏱️',
        body: `طلب #${order.orderNumber} من ${order.store.nameAr} — متبقي نحو ${minutes} دقائق حسب تقدير المتجر${order.captainId ? '' : '، يمكنك حجز التوصيل'}`,
        data: { type: 'PREPARATION_REMINDER', expiresAt: String(order.estimatedReadyAt.getTime()), orderId: order.id, storeId: order.storeId, screen: 'order', estimatedReadyAt: order.estimatedReadyAt.toISOString() },
      }, { dataOnly: true });
      if (result.totalSent > 0 && result.totalFailed === 0) {
        await prisma.order.updateMany({ where: { ...version, prepReminderLeaseUntil: lease }, data: { prepReminderSentAt: new Date(), prepReminderLeaseUntil: null } });
      }
      // Failed/no-token sends retain a short retry lease. FCM acceptance is not device receipt.
    } catch (error) {
      console.error('[preparation-reminder] Dispatch failed', candidate.id, error instanceof Error ? error.message : 'unknown');
    }
  }
}

export function startPreparationReminderScheduler(): () => Promise<void> {
  let stopped = false;
  let running: Promise<void> | null = null;
  const tick = () => {
    if (stopped || running) return;
    running = dispatchPreparationReminders().catch(error => console.error('[preparation-reminder] Scan failed', error)).finally(() => { running = null; });
  };
  const timer = setInterval(tick, 15_000);
  timer.unref();
  tick();
  return async () => { stopped = true; clearInterval(timer); await running; };
}
