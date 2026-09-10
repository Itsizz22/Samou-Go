import { describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
import { emitLiveOrderEvent } from './live-broadcast';
vi.mock('./live-session', () => ({ verifyLiveAccessToken: async (token: string) => {
  if (token !== 'current') throw new Error('revoked');
  return { sub: 'active' };
} }));
describe('private realtime delivery', () => {
  it('disconnects revoked recipients and only sends to valid sessions', async () => {
    const active = { handshake: { auth: { token: 'current' } }, emit: vi.fn(), disconnect: vi.fn() };
    const revoked = { handshake: { auth: { token: 'old' } }, emit: vi.fn(), disconnect: vi.fn() };
    const server = { in: vi.fn(() => ({ fetchSockets: async () => [active, revoked] })) };
    await emitLiveOrderEvent(server as unknown as Server, 'order', 'captain:location', { lat: 31 });
    expect(server.in).toHaveBeenCalledWith('order:order');
    expect(active.emit).toHaveBeenCalledWith('captain:location', { lat: 31 });
    expect(revoked.emit).not.toHaveBeenCalled();
    expect(revoked.disconnect).toHaveBeenCalledWith(true);
  });
});
