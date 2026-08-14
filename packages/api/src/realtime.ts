import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { prisma } from './lib/prisma';
import { verifyAccessToken } from './lib/jwt';
import { UserRole } from '@samou-go/shared-types';
import { assertCanView, loadOrderOrThrow } from './modules/orders/orders.service';

let realtime: Server | null = null;
export function emitOrderStatus(orderId: string, payload: unknown): void { realtime?.to(`order:${orderId}`).emit('order:status_updated', payload); }
export function emitPlatformEvent(event: string, payload: unknown): void { realtime?.emit(event, payload); }

/** How often a captain may write their location at most, in ms. */
const LOCATION_MIN_INTERVAL_MS = 5_000;
const lastLocationWrite = new Map<string, number>();

export function attachRealtime(server: HttpServer): Server {
  const io = new Server(server, { cors: { origin: true, credentials: true } });
  realtime = io;
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Authentication required'));
      socket.data.auth = verifyAccessToken(token);
      next();
    } catch { next(new Error('Invalid authentication')); }
  });
  io.on('connection', (socket) => {
    const auth = socket.data.auth as { sub: string; role: UserRole };
    socket.on('order:join', async (orderId: string) => {
      if (typeof orderId !== 'string' || orderId.length === 0) return;
      try {
        const order = await loadOrderOrThrow(orderId);
        await assertCanView(order, auth);
        await socket.join(`order:${orderId}`);
      } catch {
        // Not allowed to see this order — the room is simply not joined.
      }
    });
    socket.on('captain:location', async (payload: { orderId?: string; lat: number; lng: number; heading?: number }) => {
      if (auth.role !== UserRole.CAPTAIN) return;
      if (typeof payload !== 'object' || payload === null) return;
      const { lat, lng } = payload;
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) return;
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) return;
      const heading = payload.heading;
      if (heading !== undefined && (!Number.isFinite(heading) || heading < 0 || heading >= 360)) return;

      // Throttle the DB write — a watchPosition stream fires many times a second.
      const now = Date.now();
      const last = lastLocationWrite.get(auth.sub);
      if (last !== undefined && now - last < LOCATION_MIN_INTERVAL_MS) return;
      lastLocationWrite.set(auth.sub, now);

      const location = await prisma.captainLocation.upsert({
        where: { captainId: auth.sub },
        create: { captainId: auth.sub, lat, lng, heading },
        update: { lat, lng, heading },
      });

      // Broadcast only on an order actually assigned to this captain — never on
      // an arbitrary id the caller invented to push their position into a room.
      if (typeof payload.orderId === 'string' && payload.orderId.length > 0) {
        const order = await prisma.order.findUnique({
          where: { id: payload.orderId },
          select: { captainId: true },
        });
        if (order?.captainId === auth.sub) {
          io.to(`order:${payload.orderId}`).emit('captain:location', location);
        }
      }
    });
    socket.on('chat:send', async (payload: { orderId: string; message: string }) => {
      if (!payload?.message?.trim()) return;
      const order = await prisma.order.findUnique({ where: { id: payload.orderId }, select: { customerId: true, captainId: true, store: { select: { managerId: true } } } });
      if (!order || (auth.role !== UserRole.ADMIN && ![order.customerId, order.captainId, order.store.managerId].includes(auth.sub))) return;
      const row = await prisma.chatMessage.create({ data: { orderId: payload.orderId, senderId: auth.sub, senderRole: auth.role, message: payload.message.trim() } });
      io.to(`order:${payload.orderId}`).emit('chat:message', row);
    });
  });
  return io;
}
