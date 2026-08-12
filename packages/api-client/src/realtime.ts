import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';
import { getToken } from './api';

/** Authenticated Socket.io connection shared by order chat, GPS and events. */
export function connectRealtime(): Socket {
  return io(API_URL.replace(/\/api\/v1\/?$/, ''), { auth: { token: getToken() ?? undefined }, transports: ['websocket', 'polling'] });
}
