import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { getServerFailures } from '../../lib/operations';
import { ok } from '../../lib/respond';
export async function operationsHandler(_req: Request, res: Response): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const [groups, heartbeat, pending] = await Promise.all([
    prisma.notificationDelivery.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.backgroundJobHeartbeat.findUnique({ where: { id: 'preparation-reminders' } }),
    prisma.notificationDelivery.count({ where: { status: 'PENDING', createdAt: { lte: new Date(Date.now() - 5 * 60_000) } } }),
  ]);
  const counts = Object.fromEntries(groups.map(g => [g.status, g._count._all]));
  const failed = ['FAILED', 'PARTIAL', 'NO_DEVICE', 'DISABLED', 'EXPIRED'].reduce((n, key) => n + (counts[key] ?? 0), 0);
  const schedulerHealthy = !!heartbeat?.lastSucceededAt && Date.now() - heartbeat.lastSucceededAt.getTime() < 60_000;
  res.setHeader('Cache-Control', 'no-store');
  ok(res, { checkedAt: new Date().toISOString(), database: 'reachable', schedulerHealthy, notifications: { since: since.toISOString(), counts, failed, stuckPending: pending }, errors: getServerFailures() });
}
