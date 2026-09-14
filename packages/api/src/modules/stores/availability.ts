import { prisma } from '../../lib/prisma';

/** Persisted timers survive restarts. Conditional writes cannot undo a manual change. */
export async function expireAvailabilityTimers(now = new Date()): Promise<void> {
  await prisma.product.updateMany({
    where: { isAvailable: false, unavailableUntil: { lte: now } },
    data: { isAvailable: true, unavailableUntil: null },
  });
  await prisma.store.updateMany({
    where: { storeStatus: 'BUSY', busyUntil: { lte: now } },
    data: { storeStatus: 'OPEN', busyUntil: null, busyExtraMinutes: 0 },
  });
}

export function effectiveProductAvailability(product: { isAvailable: boolean; unavailableUntil?: Date | null }, now = new Date()): boolean {
  return product.isAvailable || !!(product.unavailableUntil && product.unavailableUntil <= now);
}
