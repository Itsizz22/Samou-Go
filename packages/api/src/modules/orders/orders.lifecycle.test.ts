import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import { hashPassword } from '../../lib/password';
import type { OrderDetail } from '@samou-go/shared-types';

// A real database and HTTP server, isolated from dev.db and external notifications.
const fixture = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { PrismaClient } = await import('../../../generated/prisma-sqlite');
  const directory = mkdtempSync(join(tmpdir(), 'samou-lifecycle-'));
  return { directory, db: new PrismaClient({ datasourceUrl: `file:${join(directory, 'test.db').replaceAll('\\', '/')}` }) };
});

vi.mock('../../lib/prisma', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/prisma')>(),
  prisma: fixture.db,
}));
vi.mock('../../lib/push', () => ({
  sendPushToUser: vi.fn(), sendPushToMany: vi.fn(), isPushEnabled: () => false,
}));

import { createApp } from '../../app';

let server: Server;
let base: string;
const tokens: Record<string, string> = {};
async function request<T>(method: string, route: string, role?: string, body?: unknown) {
  const response = await fetch(`${base}/api/v1${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json() as { data: T; error?: { message: string } };
  return { status: response.status, ...json };
}

beforeAll(async () => {
  const sql = execFileSync(process.execPath, [
    resolve('../../node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty',
    '--to-schema-datamodel', resolve('prisma/schema.sqlite.prisma'), '--script',
  ], { encoding: 'utf8' });
  for (const statement of sql.split(';').filter(s => s.trim())) await fixture.db.$executeRawUnsafe(statement);
  const passwordHash = await hashPassword('Lifecycle-test-only-2026');
  for (const [index, role] of ['CUSTOMER', 'STORE_MANAGER', 'CAPTAIN', 'ADMIN'].entries()) {
    await fixture.db.user.create({ data: {
      id: role, name: `اختبار ${role}`, phone: `059999100${index}`, passwordHash,
      role, isVerified: true, isAvailable: role === 'CAPTAIN',
    } });
  }
  await fixture.db.store.create({ data: {
    id: 'store', managerId: 'STORE_MANAGER', nameAr: 'متجر اختبار دورة التوصيل', nameEn: 'Lifecycle store',
    phone: '0599991099', isApproved: true,
  } });
  await fixture.db.category.create({ data: { id: 'category', storeId: 'store', nameAr: 'وجبات', nameEn: 'Meals' } });
  await fixture.db.product.create({ data: { id: 'product', storeId: 'store', categoryId: 'category', nameAr: 'وجبة', price: 12.5 } });
  await fixture.db.deliveryZone.create({ data: { id: 'zone', nameAr: 'منطقة اختبار', nameEn: 'Test zone', deliveryFee: 7 } });
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(done => server.once('listening', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server port');
  base = `http://127.0.0.1:${address.port}`;
  for (const [index, role] of ['CUSTOMER', 'STORE_MANAGER', 'CAPTAIN', 'ADMIN'].entries()) {
    const login = await request<{ accessToken: string }>('POST', '/auth/login', undefined, { phone: `059999100${index}`, password: 'Lifecycle-test-only-2026' });
    expect(login.status, JSON.stringify(login.error)).toBe(200);
    tokens[role] = login.data.accessToken;
  }
}, 30_000);

afterAll(async () => {
  if (server) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
  await fixture.db.$disconnect();
  const { rmSync } = await import('node:fs');
  // mkdtemp created this exact directory exclusively for this test.
  rmSync(fixture.directory, { recursive: true, force: true });
});

it('delivers an order with server pricing, role gates, handoff codes, PIN and exactly-once settlement', async () => {
  const created = await request<OrderDetail>('POST', '/orders', 'CUSTOMER', {
    storeId: 'store', items: [{ productId: 'product', quantity: 2 }], deliveryZoneId: 'zone',
    customerAddressText: 'عنوان اختبار محلي قرب المتجر', subtotal: 1, totalAmount: 1,
  });
  expect(created.status, JSON.stringify(created.error)).toBe(201);
  expect(created.data.subtotal).toBe(25);
  expect(created.data.totalAmount).toBe(32);
  const route = `/orders/${created.data.id}`;
  const forbidden = await request('PATCH', `${route}/status`, 'CUSTOMER', { status: 'ACCEPTED' });
  expect(forbidden.status).toBe(403);
  for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']) {
    const result = await request<OrderDetail>('PATCH', `${route}/status`, 'STORE_MANAGER', { status });
    expect(result.status, JSON.stringify(result.error)).toBe(200);
    expect(result.data.status).toBe(status);
  }
  const manager = await request<OrderDetail>('GET', route, 'STORE_MANAGER');
  expect(manager.data.captainHandoffCode).toMatch(/^\d{4}$/);
  expect(manager.data.deliveryPin).toBeNull();
  const customer = await request<OrderDetail>('GET', route, 'CUSTOMER');
  expect(customer.data.captainHandoffCode).toBeNull();
  expect((await request('GET', `${route}/pin`, 'CAPTAIN')).status).toBe(403);
  const claimed = await request<OrderDetail>('POST', `${route}/claim`, 'CAPTAIN', { handoffCode: manager.data.captainHandoffCode });
  expect(claimed.status, JSON.stringify(claimed.error)).toBe(200);
  expect(claimed.data.status).toBe('ON_THE_WAY');
  expect(claimed.data.deliveryPin).toBeNull();
  const incorrectPin = customer.data.deliveryPin === '0000' ? '0001' : '0000';
  expect((await request('PATCH', `${route}/status`, 'CAPTAIN', { status: 'DELIVERED', deliveryPin: incorrectPin })).status).toBe(400);
  const delivered = await request<OrderDetail>('PATCH', `${route}/status`, 'CAPTAIN', { status: 'DELIVERED', deliveryPin: customer.data.deliveryPin });
  expect(delivered.status, JSON.stringify(delivered.error)).toBe(200);
  const tracked = await request<OrderDetail>('GET', route, 'CUSTOMER');
  expect(tracked.data.status).toBe('DELIVERED');
  expect(tracked.data.totalAmount).toBe(32);
  const ledgerCount = await fixture.db.ledgerEntry.count();
  expect(ledgerCount).toBeGreaterThan(0);
  await request('PATCH', `${route}/status`, 'CAPTAIN', { status: 'DELIVERED', deliveryPin: customer.data.deliveryPin });
  expect(await fixture.db.ledgerEntry.count()).toBe(ledgerCount);
}, 20_000);
