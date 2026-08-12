import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { prisma } from './lib/prisma';
import { verifyAccessToken } from './lib/jwt';
import { UserRole } from '@samou-go/shared-types';

let realtime: Server | null = null;
export function emitOrderStatus(orderId: string, payload: unknown): void { realtime?.to(`order:${orderId}`).emit('order:status_updated', payload); }
export function emitPlatformEvent(event: string, payload: unknown): void { realtime?.emit(event, payload); }

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
    socket.on('order:join', (orderId: string) => socket.join(`order:${orderId}`));
    socket.on('captain:location', async (payload: { orderId?: string; lat: number; lng: number; heading?: number }) => {
      if (auth.role !== UserRole.CAPTAIN) return;
      const location = await prisma.captainLocation.upsert({ where: { captainId: auth.sub }, create: { captainId: auth.sub, lat: payload.lat, lng: payload.lng, heading: payload.heading }, update: { lat: payload.lat, lng: payload.lng, heading: payload.heading } });
      if (payload.orderId) io.to(`order:${payload.orderId}`).emit('captain:location', location);
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
