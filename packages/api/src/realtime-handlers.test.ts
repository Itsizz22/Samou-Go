vi.mock('./modules/platform/order-chat', () => ({ writeChat: vi.fn().mockResolvedValue({ id: 'message' }) }));
import { writeChat } from './modules/platform/order-chat';
vi.mock('./lib/live-session', () => ({ verifyLiveAccessToken: async () => ({ sub: 'viewer' }) }));
vi.mock('./modules/platform/platform.service', () => ({ getPlatformSettings: async () => ({ gpsCaptureEnabled: true }) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { UserRole } from '@samou-go/shared-types';
import {
  handleCaptainLocation,
  handleChatSend,
  handleOrderJoin,
  resetLocationThrottle,
} from './realtime-handlers';

/**
 * Tests for the three socket event handlers extracted from `realtime.ts`.
 * These cover the S-1/S-2 security fixes (room-join gating, location write
 * validation + throttling + assigned-order-only broadcast) and chat membership.
 */

const h = vi.hoisted(() => {
  const state = {
    order: null as Record<string, unknown> | null,
    denyView: false,
    location: { captainId: 'captain-1', lat: 31.5, lng: 35.1 },
    chatRow: {
      id: 'm-1',
      orderId: 'order-1',
      senderId: 'manager-1',
      senderRole: 'STORE_MANAGER',
      message: 'مرحبا',
      createdAt: new Date('2026-08-08T10:00:00.000Z'),
    },
  };
  return { state };
});

vi.mock('./lib/prisma', () => ({
  prisma: {
    captainLocation: { upsert: vi.fn(async () => h.state.location) },
    order: { findUnique: vi.fn(async () => h.state.order) },
    chatMessage: { create: vi.fn(async () => h.state.chatRow) },
  },
}));

vi.mock('./modules/orders/orders.service', () => ({
  loadOrderOrThrow: vi.fn(async (id: string) => {
    if (!h.state.order) throw new Error('Order not found');
    return h.state.order;
  }),
  assertCanView: vi.fn(async () => {
    if (h.state.denyView) throw new Error('Forbidden');
  }),
}));

import { prisma } from './lib/prisma';

function makeSocket() {
  return { join: vi.fn(async () => undefined) };
}

function makeIo() {
  const emits: Array<{ room: string; event: string; payload: unknown }> = [];
  const to = vi.fn((room: string) => ({
    emit: vi.fn((event: string, payload: unknown) => {
      emits.push({ room, event, payload });
    }),
  }));
  const inRoom = (room: string) => ({ fetchSockets: async () => [{ handshake: { auth: { token: 'test' } }, emit: (event: string, payload: unknown) => to(room).emit(event, payload), disconnect: vi.fn() }] });
  return { to, in: inRoom, emits };
}

const CUSTOMER = { sub: 'customer-1', role: UserRole.CUSTOMER };
const CAPTAIN = { sub: 'captain-1', role: UserRole.CAPTAIN };
const MANAGER = { sub: 'manager-1', role: UserRole.STORE_MANAGER };

beforeEach(() => {
  h.state.order = null;
  h.state.denyView = false;
  resetLocationThrottle();
  vi.clearAllMocks();
});

describe('handleOrderJoin — S-1 room-join gating', () => {
  const order = {
    id: 'order-1',
    customerId: 'customer-1',
    storeId: 'store-1',
    captainId: null,
    status: 'PENDING',
  };

  it('ignores non-string order ids', async () => {
    const socket = makeSocket();
    await handleOrderJoin(
      makeIo() as unknown as Server,
      socket as unknown as Socket,
      CUSTOMER,
      42
    );

    expect(socket.join).not.toHaveBeenCalled();
  });

  it('joins the room when the caller can view the order', async () => {
    h.state.order = order;
    const socket = makeSocket();

    await handleOrderJoin(
      makeIo() as unknown as Server,
      socket as unknown as Socket,
      CUSTOMER,
      'order-1'
    );

    expect(socket.join).toHaveBeenCalledWith('order:order-1');
  });

  it('does not join when the caller cannot view the order', async () => {
    h.state.order = order;
    h.state.denyView = true;
    const socket = makeSocket();

    await handleOrderJoin(
      makeIo() as unknown as Server,
      socket as unknown as Socket,
      CUSTOMER,
      'order-1'
    );

    expect(socket.join).not.toHaveBeenCalled();
  });

  it('does not join when the order does not exist', async () => {
    h.state.order = null;
    const socket = makeSocket();

    await handleOrderJoin(
      makeIo() as unknown as Server,
      socket as unknown as Socket,
      CUSTOMER,
      'missing'
    );

    expect(socket.join).not.toHaveBeenCalled();
  });
});

describe('handleCaptainLocation — S-2 location write', () => {
  beforeEach(() => { h.state.order = { id: 'order-1', captainId: 'captain-1', status: 'ON_THE_WAY' }; });
  it('ignores non-captain callers entirely', async () => {
    await handleCaptainLocation(makeIo() as unknown as Server, CUSTOMER, {
      lat: 31.5,
      lng: 35.1,
    });

    expect(prisma.captainLocation.upsert).not.toHaveBeenCalled();
  });

  it('rejects out-of-range or malformed coordinates', async () => {
    const io = makeIo() as unknown as Server;

    await handleCaptainLocation(io, CAPTAIN, { lat: 95, lng: 35.1 });
    await handleCaptainLocation(io, CAPTAIN, { lat: 31.5, lng: -200 });
    await handleCaptainLocation(io, CAPTAIN, { lat: '31.5', lng: 35.1 });
    await handleCaptainLocation(io, CAPTAIN, { lat: 31.5, lng: 35.1, heading: 400 });

    expect(prisma.captainLocation.upsert).not.toHaveBeenCalled();
  });

  it('does not persist a location without an active assigned order', async () => {
    const io = makeIo() as unknown as Server;
    await handleCaptainLocation(io, CAPTAIN, { lat: 31.5, lng: 35.1 });
    expect(prisma.captainLocation.upsert).not.toHaveBeenCalled();
    resetLocationThrottle();
    h.state.order = { captainId: 'captain-1', status: 'DELIVERED' };
    await handleCaptainLocation(io, CAPTAIN, { orderId: 'order-1', lat: 31.5, lng: 35.1 });
    expect(prisma.captainLocation.upsert).not.toHaveBeenCalled();
  });

  it('broadcasts only to the order actually assigned to this captain', async () => {
    h.state.order = { id: 'order-1', captainId: 'captain-2', status: 'ON_THE_WAY' };
    const ioOther = makeIo() as unknown as Server;
    await handleCaptainLocation(ioOther, CAPTAIN, { orderId: 'order-1', lat: 31.5, lng: 35.1 });
    expect(ioOther.to).not.toHaveBeenCalled();

    h.state.order = { id: 'order-1', captainId: 'captain-1', status: 'ON_THE_WAY' };
    resetLocationThrottle();
    const ioMine = makeIo() as unknown as Server;
    await handleCaptainLocation(ioMine, CAPTAIN, { orderId: 'order-1', lat: 31.5, lng: 35.1 });
    expect(ioMine.to).toHaveBeenCalledWith('order:order-1');
    expect(ioMine.emits).toEqual([
      { room: 'order:order-1', event: 'captain:location', payload: h.state.location },
    ]);
  });

  it('throttles repeated writes within the minimum interval', async () => {
    const io = makeIo() as unknown as Server;

    await handleCaptainLocation(io, CAPTAIN, { orderId: 'order-1', lat: 31.5, lng: 35.1 });
    await handleCaptainLocation(io, CAPTAIN, { orderId: 'order-1', lat: 31.6, lng: 35.2 });

    expect(prisma.captainLocation.upsert).toHaveBeenCalledTimes(1);
  });

  it('caps the tracked captains so the throttle map cannot grow unbounded', async () => {
    const io = makeIo() as unknown as Server;

    // First write registers captain-1 in the throttle map.
    await handleCaptainLocation(io, CAPTAIN, { orderId: 'order-1', lat: 31.5, lng: 35.1 });
    // 500 further distinct captains push the map past its 500-entry cap, which
    // evicts the oldest entry (captain-1).
    for (let i = 2; i <= 501; i += 1) {
      h.state.order = { captainId: `captain-${i}`, status: 'ON_THE_WAY' };
      await handleCaptainLocation(
        io,
        { sub: `captain-${i}`, role: UserRole.CAPTAIN },
        { orderId: 'order-1', lat: 31.5, lng: 35.1 }
      );
    }
    h.state.order = { captainId: 'captain-1', status: 'ON_THE_WAY' };
    // captain-1 is no longer tracked, so its immediate re-write is not throttled.
    await handleCaptainLocation(io, CAPTAIN, { orderId: 'order-1', lat: 31.6, lng: 35.2 });

    expect(prisma.captainLocation.upsert).toHaveBeenCalledTimes(502);
  });
});

describe('handleChatSend — private service delegation', () => {
  it('ignores malformed payloads', async () => {
    const io = makeIo();
    await handleChatSend(io as unknown as Server, CUSTOMER, null);
    await handleChatSend(io as unknown as Server, CUSTOMER, { message: 'hello' });
    expect(writeChat).not.toHaveBeenCalled();
  });
  it('uses the same protected service and never broadcasts private text', async () => {
    const io = makeIo();
    const body = { recipientId: 'manager-1', clientMessageId: 'client-id', message: 'hello' };
    await handleChatSend(io as unknown as Server, CUSTOMER, { orderId: 'order-1', ...body });
    expect(writeChat).toHaveBeenCalledWith('order-1', CUSTOMER, body);
    expect(io.emits).toEqual([]);
  });
});
