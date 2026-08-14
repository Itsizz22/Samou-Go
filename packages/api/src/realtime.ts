import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { verifyAccessToken } from './lib/jwt';
import { UserRole } from '@samou-go/shared-types';
import {
  handleCaptainLocation,
  handleChatSend,
  handleOrderJoin,
} from './realtime-handlers';

let realtime: Server | null = null;
export function emitOrderStatus(orderId: string, payload: unknown): void {
  realtime?.to(`order:${orderId}`).emit('order:status_updated', payload);
}
export function emitPlatformEvent(event: string, payload: unknown): void {
  realtime?.emit(event, payload);
}

export function attachRealtime(server: HttpServer): Server {
  const io = new Server(server, { cors: { origin: true, credentials: true } });
  realtime = io;
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Authentication required'));
      socket.data.auth = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('Invalid authentication'));
    }
  });
  io.on('connection', (socket) => {
    const auth = socket.data.auth as { sub: string; role: UserRole };
    socket.on('order:join', (orderId: unknown) =>
      void handleOrderJoin(io, socket, auth, orderId)
    );
    socket.on('captain:location', (payload: unknown) =>
      void handleCaptainLocation(io, auth, payload)
    );
    socket.on('chat:send', (payload: unknown) =>
      void handleChatSend(io, auth, payload)
    );
  });
  return io;
}
