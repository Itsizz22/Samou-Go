import { deliveryTransaction } from "./delivery-transaction";
import { OrderStatus } from "@samou-go/shared-types";
import { prisma } from "../../lib/prisma";
import { sendPushToMany } from "../../lib/push";
import {
  eligibleCaptainIds,
  lockCaptainCapacity,
  PREPARATION_POOL_STATUSES,
} from "./captain-pool";

const OFFER_MS = 25_000;
export function dispatchScore(
  waitMinutes: number,
  arrivalMinutes: number | null,
  readyMinutes: number,
): number {
  const fairness = Math.min(60, Math.max(0, waitMinutes)) / 3;
  if (arrivalMinutes === null) return fairness;
  return (
    fairness +
    Math.max(0, 35 - Math.abs(arrivalMinutes - readyMinutes) * 3) +
    Math.max(0, 25 - arrivalMinutes)
  );
}
function approximateArrival(
  store: { latitude: number | null; longitude: number | null },
  location: { lat: number; lng: number; updatedAt: Date } | null,
  now: Date,
): number | null {
  if (
    store.latitude === null ||
    store.longitude === null ||
    !location ||
    now.getTime() - location.updatedAt.getTime() > 120_000 ||
    location.updatedAt > now
  )
    return null;
  const radians = Math.PI / 180;
  const a =
    Math.sin(((location.lat - store.latitude) * radians) / 2) ** 2 +
    Math.cos(store.latitude * radians) *
      Math.cos(location.lat * radians) *
      Math.sin(((location.lng - store.longitude) * radians) / 2) ** 2;
  const km = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  // A bounded ranking hint, not a road ETA or a basis for penalties.
  return km > 30 ? null : (km / 20) * 60;
}

/** Persisted exclusive offers survive restarts; shared user locks prevent competing assignments. */
export async function dispatchAvailableOrders(now = new Date()): Promise<void> {
  const waiting = await prisma.order.findMany({
    where: {
      captainId: null,
      changeProposal: null,
      fulfillmentType: "DELIVERY",
      status: { in: PREPARATION_POOL_STATUSES },
      OR: [{ dispatchExpiresAt: null }, { dispatchExpiresAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      store: { select: { latitude: true, longitude: true, nameAr: true } },
    },
  });
  for (const order of waiting) {
    const ids = await eligibleCaptainIds(order.storeId);
    if (!ids.length) continue;
    const offeredElsewhere = await prisma.order.findMany({
      where: {
        captainId: null,
        dispatchExpiresAt: { gt: now },
        dispatchCaptainId: { in: ids },
        status: { in: PREPARATION_POOL_STATUSES },
      },
      select: { dispatchCaptainId: true },
    });
    const occupied = new Set(offeredElsewhere.map((o) => o.dispatchCaptainId));
    const captains = await prisma.user.findMany({
      where: { id: { in: ids.filter((id) => !occupied.has(id)) } },
      select: { id: true, lastDispatchAt: true, captainLocation: true },
    });
    const readyMinutes =
      order.status === OrderStatus.READY_FOR_PICKUP
        ? 0
        : Math.max(
            0,
            ((order.estimatedReadyAt?.getTime() ?? now.getTime()) -
              now.getTime()) /
              60_000,
          );
    captains.sort((a, b) => {
      // Rotate an expired offer before trying the same captain again.
      if (
        (a.id === order.dispatchCaptainId) !==
        (b.id === order.dispatchCaptainId)
      )
        return a.id === order.dispatchCaptainId ? 1 : -1;
      const score = (c: typeof a) =>
        dispatchScore(
          c.lastDispatchAt
            ? (now.getTime() - c.lastDispatchAt.getTime()) / 60_000
            : 60,
          approximateArrival(order.store, c.captainLocation, now),
          readyMinutes,
        );
      return (
        score(b) - score(a) ||
        (a.lastDispatchAt?.getTime() ?? 0) -
          (b.lastDispatchAt?.getTime() ?? 0) ||
        a.id.localeCompare(b.id)
      );
    });
    for (const captain of captains) {
      try {
        const offered = await deliveryTransaction(async (tx) => {
          await lockCaptainCapacity(tx, captain.id, order.id);
          if (
            !(await eligibleCaptainIds(order.storeId, tx)).includes(captain.id)
          )
            return false;
          if (
            await tx.order.count({
              where: {
                captainId: null,
                dispatchCaptainId: captain.id,
                dispatchExpiresAt: { gt: now },
                status: { in: PREPARATION_POOL_STATUSES },
              },
            })
          )
            return false;
          const updated = await tx.order.updateMany({
            where: {
              id: order.id,
              captainId: null,
              changeProposal: null,
              status: { in: PREPARATION_POOL_STATUSES },
              updatedAt: order.updatedAt,
              OR: [
                { dispatchExpiresAt: null },
                { dispatchExpiresAt: { lte: now } },
              ],
            },
            data: {
              dispatchCaptainId: captain.id,
              dispatchExpiresAt: new Date(now.getTime() + OFFER_MS),
            },
          });
          if (!updated.count) return false;
          await tx.user.update({
            where: { id: captain.id },
            data: { lastDispatchAt: now },
          });
          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              status: order.status,
              note: `عرض التوصيل على الكابتن ${captain.id} / Delivery offered`,
            },
          });
          return true;
        });
        if (!offered) continue;
        await sendPushToMany(
          [captain.id],
          {
            title: "طلب توصيل متاح لك",
            body: `طلب #${order.orderNumber} من ${order.store.nameAr} — افتح الطلب لقبول التوصيل`,
            data: {
              type:
                order.status === OrderStatus.READY_FOR_PICKUP
                  ? "NEW_ORDER"
                  : "PREPARATION_AVAILABLE",
              orderId: order.id,
              storeId: order.storeId,
              screen: "order",
              expiresAt: String(now.getTime() + OFFER_MS),
            },
          },
          { dataOnly: true },
        );
        break;
      } catch (error) {
        // A busy captain or a concurrent reservation is retried on the next scan.
        console.warn(
          "[dispatch] Offer deferred",
          order.id,
          error instanceof Error ? error.message : "unknown",
        );
      }
    }
  }
}
