import { recordPilotEvent } from '../../lib/pilot-telemetry';
import { deliveryTransaction } from "./delivery-transaction";
import { OrderStatus } from "@samou-go/shared-types";
import { prisma } from "../../lib/prisma";
import { sendPushToMany } from "../../lib/push";
import {
  ACTIVE_CAPTAIN_STATUSES,
  eligibleCaptainIds,
  lockCaptainCapacity,
  PREPARATION_POOL_STATUSES,
  storeDispatchPressure,
} from "./captain-pool";

const OFFER_MS = 25_000;
type Coordinate = { latitude: number | null; longitude: number | null };
type CaptainLocation = { lat: number; lng: number; updatedAt: Date } | null;

function validPoint(point: Coordinate): point is { latitude: number; longitude: number } {
  return point.latitude !== null && point.longitude !== null &&
    Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}
function distanceKm(a: Coordinate, b: Coordinate): number | null {
  if (!validPoint(a) || !validPoint(b)) return null;
  const radians = Math.PI / 180;
  const value = Math.sin((b.latitude - a.latitude) * radians / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) *
    Math.sin((b.longitude - a.longitude) * radians / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, value)));
}

/** Lower is better. Pickup proximity leads, while customer proximity breaks route tradeoffs.
 * Straight-line distance is a ranking hint, never a road ETA or delivery fee.
 * Missing/stale GPS falls back behind drivers with a usable location.
 */
export function dispatchDistance(store: Coordinate, customer: Coordinate, location: CaptainLocation, now: Date): number | null {
  if (!location || now.getTime() - location.updatedAt.getTime() > 120_000 || location.updatedAt > now) return null;
  const point = { latitude: location.lat, longitude: location.lng };
  const pickup = distanceKm(point, store);
  const dropoff = distanceKm(point, customer);
  if (pickup === null) return dropoff;
  return dropoff === null ? pickup : pickup * 0.65 + dropoff * 0.35;
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
      select: { id: true, lastDispatchAt: true, captainLocation: true, captainOrders: { where: { status: { in: ACTIVE_CAPTAIN_STATUSES } }, select: { id: true } } },
    });
    const pressure = await storeDispatchPressure(order.storeId);
    captains.sort((a, b) => {
      // Rotate an expired offer before trying the same captain again.
      if (
        (a.id === order.dispatchCaptainId) !==
        (b.id === order.dispatchCaptainId)
      )
        return a.id === order.dispatchCaptainId ? 1 : -1;
      // Under load, spread work before adding a third delivery to the nearest driver.
      if (pressure.active && a.captainOrders.length !== b.captainOrders.length) {
        return a.captainOrders.length - b.captainOrders.length;
      }
      const distance = (c: typeof a) => dispatchDistance(order.store, order, c.captainLocation, now);
      const aDistance = distance(a), bDistance = distance(b);
      if (aDistance === null && bDistance !== null) return 1;
      if (aDistance !== null && bDistance === null) return -1;
      return (
        (aDistance !== null && bDistance !== null ? aDistance - bDistance : 0) ||
        a.captainOrders.length - b.captainOrders.length ||
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
        recordPilotEvent({ kind: 'dispatch', orderId: order.id, captainId: captain.id, result: 'OFFERED', activeOrders: captain.captainOrders.length, policy: pressure.active ? 'PRESSURE_LOAD_THEN_DISTANCE' : 'DISTANCE_THEN_LOAD' });
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
