import type { Server, Socket } from 'socket.io';
import { UserRole } from '@samou-go/shared-types';
import { prisma } from './lib/prisma';
import { assertCanView, loadOrderOrThrow } from './modules/orders/orders.service';

/** How often a captain may write their location at most, in ms. */
const LOCATION_MIN_INTERVAL_MS = 5_000;
const lastLocationWrite = new Map<string, number>();

/** Test seam: clears the location throttle so a fresh captain can write again. */
export function resetLocationThrottle(): void {
  lastLocationWrite.clear();
}

type Auth = { sub: string; role: UserRole };

/**
 * S-1: order:join — a client may only join the room of an order it can view.
 * `loadOrderOrThrow` + `assertCanView` run the same ownership rules the REST
 * layer uses; a rejection just means the room is never joined.
 */
export async function handleOrderJoin(
  io: Server,
  socket: Socket,
  auth: Auth,
  orderId: unknown
): Promise<void> {
  if (typeof orderId !== 'string' || orderId.length === 0) return;
  try {
    const order = await loadOrderOrThrow(orderId);
    await assertCanView(order, auth);
    await socket.join(`order:${orderId}`);
  } catch {
    // Not allowed to see this order — the room is simply not joined.
  }
}

/**
 * S-2: captain:location — a captain may only write their own location, and only
 * if the payload is well-formed and throttled (a watchPosition stream fires
 * many times a second). The location is broadcast to a room only when the order
 * is actually assigned to this captain — never on an arbitrary id the caller
 * invented to push their position into a room.
 */
export async function handleCaptainLocation(
  io: Server,
  auth: Auth,
  payload: unknown
): Promise<void> {
  if (auth.role !== UserRole.CAPTAIN) return;
  if (typeof payload !== 'object' || payload === null) return;
  const { lat, lng } = payload as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return;
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) return;
  const heading = (payload as { heading?: unknown }).heading;
  if (
    heading !== undefined &&
    (typeof heading !== 'number' || !Number.isFinite(heading) || heading < 0 || heading >= 360)
  ) {
    return;
  }

  const now = Date.now();
  const last = lastLocationWrite.get(auth.sub);
  if (last !== undefined && now - last < LOCATION_MIN_INTERVAL_MS) return;
  lastLocationWrite.set(auth.sub, now);

  const location = await prisma.captainLocation.upsert({
    where: { captainId: auth.sub },
    create: { captainId: auth.sub, lat, lng, heading },
    update: { lat, lng, heading },
  });

  const orderId = (payload as { orderId?: unknown }).orderId;
  if (typeof orderId === 'string' && orderId.length > 0) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { captainId: true },
    });
    if (order?.captainId === auth.sub) {
      io.to(`order:${orderId}`).emit('captain:location', location);
    }
  }
}

/**
 * chat:send — only an order party (customer, assigned captain, store manager)
 * or an admin may post; the message is broadcast to the order's room.
 */
export async function handleChatSend(io: Server, auth: Auth, payload: unknown): Promise<void> {
  if (typeof payload !== 'object' || payload === null) return;
  const { orderId, message } = payload as { orderId?: unknown; message?: unknown };
  if (typeof orderId !== 'string' || orderId.length === 0) return;
  if (typeof message !== 'string' || !message.trim()) return;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, captainId: true, store: { select: { managerId: true } } },
  });
  if (
    !order ||
    (auth.role !== UserRole.ADMIN &&
      ![order.customerId, order.captainId, order.store.managerId].includes(auth.sub))
  ) {
    return;
  }
  const row = await prisma.chatMessage.create({
    data: { orderId, senderId: auth.sub, senderRole: auth.role, message: message.trim() },
  });
  io.to(`order:${orderId}`).emit('chat:message', row);
}
