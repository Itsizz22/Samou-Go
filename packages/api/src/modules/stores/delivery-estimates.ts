import type { Store } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';

export function estimateDelivery(samples: number[]): Store['deliveryEstimate'] {
  const valid = samples.filter(value => Number.isFinite(value) && value >= 5 && value <= 240).sort((a,b) => a-b);
  if (valid.length < 5) return null;
  const lower = valid[Math.floor((valid.length - 1) * 0.2)]!;
  const upper = valid[Math.ceil((valid.length - 1) * 0.8)]!;
  const minMinutes = Math.max(5, Math.floor(lower / 5) * 5);
  return { minMinutes, maxMinutes: Math.max(minMinutes + 5, Math.ceil(upper / 5) * 5), sampleSize: valid.length };
}

/** Bounded recent samples per store; delivery history, never mutable updatedAt. */
export async function deliveryEstimates(ids: string[]): Promise<Map<string, Store['deliveryEstimate']>> {
  if (!ids.length) return new Map();
  const rows = await prisma.store.findMany({ where: { id: { in: ids } }, select: { id: true, orders: {
    where: { status: 'DELIVERED', fulfillmentType: 'DELIVERY', createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    orderBy: { createdAt: 'desc' }, take: 30,
    select: { createdAt: true, statusHistory: { where: { status: 'DELIVERED' }, orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true } } },
  } } });
  return new Map(rows.map(store => [store.id, estimateDelivery(store.orders.flatMap(order => {
    const finished = order.statusHistory[0]?.createdAt;
    return finished ? [(finished.getTime() - order.createdAt.getTime()) / 60000] : [];
  }))]));
}
