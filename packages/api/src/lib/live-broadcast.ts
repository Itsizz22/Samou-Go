import type { Server } from 'socket.io';
import { verifyLiveAccessToken } from './live-session';

/** Recheck recipients too: a revoked idle socket must not receive private events. */
export async function emitLiveOrderEvent(io: Server, orderId: string, event: string, payload: unknown): Promise<void> {
  const sockets = await io.in(`order:${orderId}`).fetchSockets();
  await Promise.all(sockets.map(async socket => {
    try {
      await verifyLiveAccessToken(String(socket.handshake.auth?.token ?? ''));
      socket.emit(event, payload);
    } catch { socket.disconnect(true); }
  }));
}
