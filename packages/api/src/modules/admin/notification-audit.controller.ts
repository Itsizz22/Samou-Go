import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { ok } from '../../lib/respond';
import { requireAuth } from '../../middleware/authenticate';
import { notFound } from '../../lib/http-error';
import { z } from 'zod';
import { parseWith } from '../../lib/validate';

export async function notificationAuditHandler(req: Request, res: Response): Promise<void> {
  const { page, orderId } = parseWith(z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), orderId: z.string().max(100).optional() }), req.query);
  const where = orderId ? { orderId } : {};
  const [items, total, heartbeat] = await Promise.all([
    prisma.notificationDelivery.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30, skip: (page - 1) * 30 }),
    prisma.notificationDelivery.count({ where }),
    prisma.backgroundJobHeartbeat.findUnique({ where: { id: 'preparation-reminders' } }),
  ]);
  ok(res, { items, total, page, heartbeat, schedulerHealthy: !!heartbeat?.lastSucceededAt && Date.now() - heartbeat.lastSucceededAt.getTime() < 60_000 });
}
export async function notificationOpenedHandler(req: Request, res: Response): Promise<void> {
  const actor = requireAuth(req);
  const { id } = parseWith(z.object({ id: z.string().min(1).max(100) }), req.params);
  const owned = await prisma.notificationDelivery.findFirst({ where: { id, userId: actor.sub }, select: { id: true } });
  if (!owned) throw notFound('الإشعار غير موجود / Notification not found');
  await prisma.notificationDelivery.updateMany({ where: { id, userId: actor.sub, openedAt: null }, data: { openedAt: new Date() } });
  ok(res, { recorded: true });
}
