import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { UserRole } from '@samou-go/shared-types';

/**
 * Route-level tests for the order-tracking SSE stream.
 *
 * Two regressions are pinned here, both of which silently reduced live tracking
 * to 15-second polling in `web-order-tracking`:
 *
 *   1. The stream sat *below* `ordersRouter.use(authenticate)`, so it 401'd for
 *      every browser — `EventSource` cannot send an `Authorization` header.
 *   2. The client asked for `/orders/events/:id` while the API served
 *      `/orders/:id/events`, so even an authenticated caller got a 404.
 */

const h = vi.hoisted(() => {
  const env = {
    nodeEnv: 'test',
    isProduction: false,
    isTest: true,
    port: 4000,
    databaseUrl: 'postgres://test@localhost:5432/test',
    jwt: {
      secret: 'sse-route-test-secret-at-least-32-characters-long',
      expiresIn: '1h',
      refreshExpiresIn: '30d',
    },
    sms: { provider: 'none', generic: {}, twilio: {}, firebase: {} },
    otp: { length: 6, ttlMs: 180000, rateMax: 3, rateWindowMs: 300000, maxAttempts: 5 },
    corsOrigins: ['http://localhost:5173'],
    deliveryFeeConfig: { baseFee: 0, bulkFee: 0, bulkThreshold: 5, currency: 'ILS' },
    publicApiOrigin: 'http://localhost:4000',
    uploads: { dir: './.tmp-uploads', maxBytes: 8 * 1024 * 1024 },
  };

  const order = {
    id: 'order-demo-1',
    orderNumber: 'SG-20260815-0001',
    // Literal, not `OrderStatus.PREPARING` — `vi.hoisted` runs before imports.
    status: 'PREPARING',
    customerId: 'u-customer',
    storeId: 'store-1',
    captainId: null,
    items: [],
    statusHistory: [],
  };

  const prisma = {
    order: { findUnique: async () => order },
  };

  return { env, order, prisma };
});

vi.mock('../../config/env', () => ({
  env: h.env,
  parseDurationMs: () => 3_600_000,
}));
vi.mock('../../lib/prisma', () => ({
  prisma: h.prisma,
  disconnectPrisma: async () => {},
  caseInsensitiveContains: (value: string) => ({ contains: value }),
}));

import { createApp } from '../../app';
import { signAccessToken } from '../../lib/jwt';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp();
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(() => new Promise<void>(resolve => server?.close(() => resolve())));

/**
 * Opens a request, reads the status/headers, then aborts — an SSE response never
 * ends on its own, so leaving the body unread would hang the suite.
 */
async function peek(
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: Headers }> {
  const controller = new AbortController();
  try {
    const res = await fetch(`${baseUrl}${path}`, { headers, signal: controller.signal });
    return { status: res.status, headers: res.headers };
  } finally {
    controller.abort();
  }
}

describe('GET /orders/:orderId/events', () => {
  it('opens an event stream for an anonymous caller instead of 401ing', async () => {
    const { status, headers } = await peek(`/orders/${h.order.id}/events`);
    expect(status).toBe(200);
    expect(headers.get('content-type')).toContain('text/event-stream');
    expect(headers.get('cache-control')).toContain('no-cache');
  });

  it('404s on the id-last path the client used to request', async () => {
    // A token is needed to see the 404: `/orders/events/<id>` matches no route,
    // so it falls through to the `authenticate` gate and 401s anonymously —
    // which is exactly how the real bug stayed invisible.
    const token = signAccessToken({
      userId: 'u-customer',
      role: UserRole.CUSTOMER,
      phone: '0599300101',
    }).accessToken;
    const { status } = await peek(`/orders/events/${h.order.id}`, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(404);
  });
});

describe('the authenticate gate below the stream still holds', () => {
  it.each([
    ['/orders', 'order list'],
    [`/orders/${h.order.id}`, 'order detail'],
  ])('401s anonymous access to %s (%s)', async path => {
    const { status } = await peek(path);
    expect(status).toBe(401);
  });
});

describe('CORS for the deployed SPAs', () => {
  it('lets a Vercel production origin read the stream with credentials', async () => {
    const origin = 'https://samou-go-order-tracking.vercel.app';
    const { status, headers } = await peek(`/orders/${h.order.id}/events`, { Origin: origin });
    expect(status).toBe(200);
    expect(headers.get('access-control-allow-origin')).toBe(origin);
    expect(headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('lets a Vercel preview origin in as well', async () => {
    const origin = 'https://samou-go-order-tracking-git-main-acme.vercel.app';
    const { headers } = await peek(`/orders/${h.order.id}/events`, { Origin: origin });
    expect(headers.get('access-control-allow-origin')).toBe(origin);
  });

  it('rejects an unlisted origin with the 403 envelope', async () => {
    const { status } = await peek(`/orders/${h.order.id}/events`, {
      Origin: 'https://evil.example.com',
    });
    expect(status).toBe(403);
  });

  it('answers a preflight with the allowed verbs and headers', async () => {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://samou-go-customer.vercel.app',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    expect(res.status).toBe(204);
    const methods = res.headers.get('access-control-allow-methods') ?? '';
    for (const verb of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(methods).toContain(verb);
    }
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    // Roles are irrelevant to the preflight — the browser sends no token on it.
    expect(UserRole.CUSTOMER).toBe('CUSTOMER');
  });
});
