import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { UserRole } from '@samou-go/shared-types';

/**
 * Integration tests for the full HTTP security stack: authentication, RBAC,
 * Zod validation, the error envelope and rate limiting. A real Express app
 * (`createApp`) is booted on an ephemeral port and driven over HTTP, with the
 * database mocked away — every assertion here is about the middleware chain,
 * not business logic.
 */

const h = vi.hoisted(() => {
  const env = {
    nodeEnv: 'test',
    isProduction: false,
    isTest: false,
    port: 4000,
    databaseUrl: 'postgres://test@localhost:5432/test',
    jwt: {
      secret: 'integration-test-secret-at-least-32-characters-long',
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

  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'u-customer-1',
        name: 'زبون',
        phone: '0599000001',
        role: UserRole.CUSTOMER,
        isActive: true,
        isVerified: false,
        isAvailable: false,
        createdAt: new Date('2026-08-08T10:00:00.000Z'),
        updatedAt: new Date('2026-08-08T10:00:00.000Z'),
      }),
      // For the admin `/users` list happy-path test.
      findMany: async () => [],
      count: async () => 0,
    },
  };

  return { env, prisma };
});

vi.mock('../config/env', () => ({
  env: h.env,
  parseDurationMs: (value: string) => {
    const match = /^(\d+)(s|m|h|d|w)?$/.exec(value.trim());
    if (!match) throw new Error(`Invalid duration string: "${value}"`);
    const amount = Number(match[1]);
    const perUnit: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000,
    };
    return amount * (perUnit[match[2] ?? 's'] ?? 1_000);
  },
}));
vi.mock('../lib/prisma', () => ({ prisma: h.prisma, disconnectPrisma: async () => {} }));

import { createApp } from '../app';
import { signAccessToken } from '../lib/jwt';

/* ---------------------------------------------------------------------------
 * Harness — one shared server for most tests, fresh ones for rate limiting
 * ------------------------------------------------------------------------- */

let server: Server;
let baseUrl: string;

async function boot(): Promise<{ server: Server; baseUrl: string }> {
  const app = createApp();
  const srv = app.listen(0);
  await new Promise<void>(resolve => srv.once('listening', resolve));
  const address = srv.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { server: srv, baseUrl: `http://127.0.0.1:${port}/api/v1` };
}

beforeAll(async () => {
  const booted = await boot();
  server = booted.server;
  baseUrl = booted.baseUrl;
});

afterAll(() => new Promise<void>(resolve => server?.close(() => resolve())));

/** Fresh module graph → fresh rate-limiter stores, so each test is isolated. */
async function withFreshServer(): Promise<{ server: Server; baseUrl: string }> {
  vi.resetModules();
  const { createApp: freshCreateApp } = await import('../app');
  const app = freshCreateApp();
  const srv = app.listen(0);
  await new Promise<void>(resolve => srv.once('listening', resolve));
  const address = srv.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { server: srv, baseUrl: `http://127.0.0.1:${port}/api/v1` };
}

async function close(srv: Server): Promise<void> {
  if (!srv) return;
  await new Promise<void>(resolve => srv.close(() => resolve()));
}

interface CallOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

async function call(path: string, options: CallOptions = {}) {
  const { method = 'GET', token, body } = options;
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, json };
}

/* ---------------------------------------------------------------------------
 * Tokens — minted with the real signer using each verified role
 * ------------------------------------------------------------------------- */

function token(role: UserRole, sub: string, phone: string): string {
  return signAccessToken({ userId: sub, role, phone }).accessToken;
}

const customerToken = token(UserRole.CUSTOMER, 'u-customer', '0599000001');
const managerToken = token(UserRole.STORE_MANAGER, 'u-manager', '0599000002');
const captainToken = token(UserRole.CAPTAIN, 'u-captain', '0599000003');
const adminToken = token(UserRole.ADMIN, 'u-admin', '0599000004');

function expiredToken(role: UserRole, sub: string, phone: string): string {
  return jwt.sign(
    { role, phone, exp: Math.floor(Date.now() / 1000) - 60 },
    h.env.jwt.secret,
    { subject: sub }
  );
}

/* ---------------------------------------------------------------------------
 * Unauthorized endpoint access (401) and role escalation (403)
 * ------------------------------------------------------------------------- */

describe('RBAC on protected routes', () => {
  it('returns 401 without a token on protected routes', async () => {
    for (const path of ['/orders', '/favorites', '/users', '/admin/stats', '/auth/me']) {
      const res = await call(path);
      expect(res.status).toBe(401);
      expect(res.json).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
  });

  it('rejects a CUSTOMER from ADMIN-only routes with 403', async () => {
    const res = await call('/users', { token: customerToken });
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('rejects a STORE_MANAGER from admin dashboards with 403', async () => {
    const res = await call('/admin/stats', { token: managerToken });
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('rejects a CAPTAIN from captain verification with 403', async () => {
    const res = await call('/captains/u-x/verify', { token: captainToken, method: 'PATCH' });
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('rejects a CUSTOMER from store approval with 403', async () => {
    const res = await call('/stores/store-1/approve', { token: customerToken, method: 'PATCH' });
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('rejects a CUSTOMER from the store-manager full catalogue with 403', async () => {
    const res = await call('/stores/store-1/full', { token: customerToken });
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('rejects a CAPTAIN from placing an order with 403', async () => {
    const res = await call('/orders', {
      method: 'POST',
      token: captainToken,
      body: { storeId: 'store-1', items: [{ productId: 'p-1', quantity: 1 }], customerAddressText: 'addr' },
    });
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('admits an ADMIN to /users (200 envelope)', async () => {
    const res = await call('/users', { token: adminToken });
    // The DB is mocked to an empty object; reaching 200 with the envelope is
    // the point — the gate let the admin through.
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ success: true });
  });

  it('serves /auth/me using the identity from the verified token', async () => {
    const res = await call('/auth/me', { token: customerToken });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      success: true,
      data: { id: 'u-customer-1', role: UserRole.CUSTOMER },
    });
  });
});

/* ---------------------------------------------------------------------------
 * Bad token handling
 * ------------------------------------------------------------------------- */

describe('bad token handling', () => {
  it('rejects a garbage token with 401', async () => {
    const res = await call('/auth/me', { token: 'definitely.not.valid' });
    expect(res.status).toBe(401);
    expect(res.json).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('rejects a token signed with the wrong secret with 401', async () => {
    const forged = jwt.sign(
      { role: UserRole.ADMIN, phone: '0599000001' },
      'an-attackers-secret-that-should-never-be-ours-!!!!',
      { subject: 'u-customer' }
    );
    const res = await call('/auth/me', { token: forged });
    expect(res.status).toBe(401);
    expect(res.json).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('rejects an expired token with 401', async () => {
    const res = await call('/auth/me', { token: expiredToken(UserRole.CUSTOMER, 'u-customer', '0599000001') });
    expect(res.status).toBe(401);
    expect(res.json).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('rejects a token whose role claim is not a real role (forgery) with 401', async () => {
    const forged = jwt.sign(
      { role: 'SUPERUSER', phone: '0599000001' },
      h.env.jwt.secret,
      { subject: 'u-customer' }
    );
    const res = await call('/auth/me', { token: forged });
    expect(res.status).toBe(401);
    expect(res.json).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });
});

/* ---------------------------------------------------------------------------
 * Invalid Zod payloads → structured 422 with field details
 * ------------------------------------------------------------------------- */

describe('invalid payload rejection', () => {
  it('rejects an invalid phone on /auth/login with 422 + field details', async () => {
    const res = await call('/auth/login', {
      method: 'POST',
      body: { phone: '123', password: 'secret1' },
    });
    expect(res.status).toBe(422);
    const error = (res.json?.error ?? {}) as { code: string; details: { path: string }[] };
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.map(d => d.path)).toContain('phone');
  });

  it('rejects a missing password with 422', async () => {
    const res = await call('/auth/login', {
      method: 'POST',
      body: { phone: '0599000001' },
    });
    expect(res.status).toBe(422);
    expect((res.json?.error as { code: string }).code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-object login body with 400 INVALID_JSON', async () => {
    const res = await call('/auth/login', {
      method: 'POST',
      body: 'just a string',
    });
    expect(res.status).toBe(400);
    expect((res.json?.error as { code: string }).code).toBe('INVALID_JSON');
  });

  it('rejects an invalid order body even with a valid customer token', async () => {
    const res = await call('/orders', {
      method: 'POST',
      token: customerToken,
      body: { storeId: '', items: [] },
    });
    expect(res.status).toBe(422);
    expect((res.json?.error as { code: string }).code).toBe('VALIDATION_ERROR');
  });

  it('returns the standard 404 envelope for an unknown route', async () => {
    const res = await call('/no/such/endpoint');
    expect(res.status).toBe(404);
    expect(res.json).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

/* ---------------------------------------------------------------------------
 * CORS — a disallowed origin is a 403 in the standard envelope, never a 500
 * ------------------------------------------------------------------------- */

describe('CORS origin policy', () => {
  it('rejects a disallowed Origin with 403 ORIGIN_NOT_ALLOWED', async () => {
    const res = await fetch(`${baseUrl}/stores`, {
      headers: { Origin: 'https://evil.example.com' },
    });
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(403);
    expect(json).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('allows an Origin on the allow-list', async () => {
    // `/health` is a DB-free public route, so the assertion isolates the CORS
    // gate from business logic / database mocking.
    const health = `${baseUrl.slice(0, -'/api/v1'.length)}/health`;
    const res = await fetch(health, {
      headers: { Origin: 'http://localhost:5173' },
    });
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ success: true });
  });
});

/* ---------------------------------------------------------------------------
 * Rate limiting on /auth/login and /auth/register
 * ------------------------------------------------------------------------- */

describe('rate limiting', () => {
  it('blocks the 11th /auth/login attempt with a 429 envelope', async () => {
    const { server: srv, baseUrl: fresh } = await withFreshServer();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        const res = await fetch(`${fresh}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '123', password: 'secret1' }),
        });
        statuses.push(res.status);
        if (i === 10) {
          const json = (await res.json()) as { error: { code: string } };
          expect(json.error.code).toBe('TOO_MANY_REQUESTS');
        }
      }
      expect(statuses.slice(0, 10).every(s => s === 422)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      await close(srv);
    }
  });

  it('blocks the 11th /auth/register attempt with a 429 envelope', async () => {
    const { server: srv, baseUrl: fresh } = await withFreshServer();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        const res = await fetch(`${fresh}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'x', phone: '123', password: 'secret1' }),
        });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every(s => s === 422)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      await close(srv);
    }
  });
});
