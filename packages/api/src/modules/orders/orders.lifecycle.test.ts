import { nextPublicCode } from '../../lib/public-code';
import { randomUUID } from 'node:crypto';
import { UserRole } from '@samou-go/shared-types';
import { signAccessToken } from '../../lib/jwt';
import { eligibleCaptainIds } from './captain-pool';
import { readFileSync } from 'node:fs';
import { dispatchUnclaimedAlerts, dispatchPreparationReminders } from './preparation-reminders';
import { sendPushToMany } from '../../lib/push';
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
  sendPushToUser: vi.fn().mockResolvedValue({ sent: 1, failed: 0 }), sendPushToMany: vi.fn().mockResolvedValue({ totalSent: 1, totalFailed: 0 }), isPushEnabled: () => false,
}));

import { createApp } from '../../app';

let server: Server;
let base: string;
const tokens: Record<string, string> = {};
async function request<T>(method: string, route: string, role?: string, body?: unknown) {
  const response = await fetch(`${base}/api/v1${route}`, {
    method,
    signal: AbortSignal.timeout(5_000),
    headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json() as { data: T; error?: { message: string } };
  return { status: response.status, ...json };
}

beforeAll(async () => {
  const sqlFile = resolve(fixture.directory, "schema.sql");
  execFileSync(process.execPath, [
    resolve('../../node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty',
    '--to-schema-datamodel', resolve('prisma/schema.sqlite.prisma'), '--script', '--output', sqlFile,
  ], { encoding: 'utf8' });
  const sql = readFileSync(sqlFile, 'utf8');
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

it('notifies captains only after acceptance makes notification details accessible', async () => {
  await fixture.db.store.update({ where: { id: 'store' }, data: { dedicatedCaptains: { connect: { id: 'CAPTAIN' } } } });
  const pushes = vi.mocked(sendPushToMany); pushes.mockClear();
  const created = await request<OrderDetail>('POST', '/orders', 'CUSTOMER', { storeId: 'store', items: [{ productId: 'product', quantity: 1 }], customerAddressText: 'عنوان اختبار تنبيه الكابتن', deliveryZoneId: 'zone' });
  expect(created.status).toBe(201);
  const route = '/orders/' + created.data.id;
  expect((await request('GET', route, 'CAPTAIN')).status).toBe(403);
  expect(pushes).not.toHaveBeenCalled();
  expect((await request('PATCH', route + '/status', 'STORE_MANAGER', { status: 'ACCEPTED', estimatedPrepMinutes: 10 })).status).toBe(200);
  await vi.waitFor(() => expect(pushes).toHaveBeenCalledWith(['CAPTAIN'], expect.objectContaining({ data: expect.objectContaining({ type: 'PREPARATION_AVAILABLE', orderId: created.data.id }) }), { dataOnly: true }));
  expect((await request('GET', route, 'CAPTAIN')).status).toBe(200);
  await fixture.db.order.delete({ where: { id: created.data.id } });
  await fixture.db.store.update({ where: { id: 'store' }, data: { dedicatedCaptains: { disconnect: { id: 'CAPTAIN' } } } });
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

it('rejects invalid checkout sessions and returns cross-origin headers for missing uploads', async () => {
  const response = await fetch(`${base}/api/v1/orders`, {
    method: 'POST', headers: { Authorization: 'Bearer invalid-session', 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId: 'store', items: [{ productId: 'product', quantity: 1 }], customerAddressText: 'Test address' }),
  });
  expect(response.status).toBe(401);
  const image = await fetch(`${base}/uploads/missing-test-image.webp`);
  expect(image.status).toBe(200);
  expect(image.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
  expect(image.headers.get('X-Image-Fallback')).toBe('missing-upload');
  expect(image.headers.get('Cache-Control')).toBe('no-store');
  expect(image.headers.get('Content-Type')).toContain('image/svg+xml');
  expect((await fetch(`${base}/uploads/missing-test-audio.webm`)).status).toBe(404);
});

it('authenticates support conversations and derives ownership from the session', async () => {
  expect((await request('GET', '/support')).status).toBe(401);
  const created = await request<{ id: string; userId: string }>('POST', '/support', 'CUSTOMER', {
    ticketNumber: 'client-number', userId: 'ADMIN', category: 'GENERAL', subject: 'اختبار الدعم', priority: 'NORMAL',
  });
  expect(created.status, JSON.stringify(created.error)).toBe(201);
  expect(created.data.userId).toBe('CUSTOMER');
  const route = `/support/${created.data.id}`;
  expect((await request('GET', route, 'CAPTAIN')).status).toBe(403);
  const reply = await request<{ senderRole: string; senderId: string }>('POST', `${route}/messages`, 'CUSTOMER', {
    senderId: 'ADMIN', senderRole: 'ADMIN', message: 'رسالة اختبار محلية',
  });
  expect(reply.status, JSON.stringify(reply.error)).toBe(200);
  expect(reply.data.senderId).toBe('CUSTOMER');
  expect(reply.data.senderRole).toBe('CUSTOMER');
  expect((await request('PATCH', `${route}/status`, 'CUSTOMER', { status: 'RESOLVED' })).status).toBe(403);
  expect((await request('PATCH', `${route}/status`, 'ADMIN', { status: 'RESOLVED' })).status).toBe(200);
});

it('serves ranked products on SQLite with complete option rules and numeric prices', async () => {
  await fixture.db.productOptionGroup.create({ data: {
    id: 'showcase-group', productId: 'product', name: 'إضافات', minSelect: 0, maxSelect: 2,
    items: { create: { id: 'showcase-option', name: 'جبنة', price: 3.25 } },
  } });
  const response = await request<import('@samou-go/shared-types').PopularProduct[]>('GET', '/stores/popular-products');
  expect(response.status).toBe(200);
  expect(response.data[0]).toMatchObject({
    id: 'product', price: 12.5, totalSold: 2, storeLogoUrl: null, hasOptions: true,
    optionGroups: [{ id: 'showcase-group', minSelect: 0, maxSelect: 2, required: false,
      items: [{ id: 'showcase-option', priceDelta: 3.25, isActive: true }] }],
  });
  const scoped = await request<import('@samou-go/shared-types').PopularProduct[]>('GET', '/stores/popular-products?storeId=store');
  expect(scoped.data.map(product => product.id)).toEqual(['product']);
  expect((await request<unknown[]>('GET', '/stores/popular-products?storeId=another-store')).data).toEqual([]);
  await fixture.db.product.update({ where: { id: 'product' }, data: { optionsEnabled: false } });
  const disabled = await request<import('@samou-go/shared-types').PopularProduct[]>('GET', '/stores/popular-products');
  expect(disabled.data[0]?.hasOptions).toBe(false);
  expect(disabled.data[0]?.optionGroups).toBeUndefined();
  await fixture.db.store.update({ where: { id: 'store' }, data: { isActive: false } });
  expect((await request<unknown[]>('GET', '/stores/popular-products')).data).toEqual([]);
});
it('ranks discovery by recency and ratings, fills sparse feeds, and hides unpublished data', async () => {
  const old = new Date('2020-01-01');
  await fixture.db.store.update({ where: { id: 'store' }, data: { isActive: true, createdAt: old } });
  await fixture.db.product.update({ where: { id: 'product' }, data: { createdAt: old, optionsEnabled: true } });
  await fixture.db.store.create({ data: { id: 'new-store', nameAr: 'متجر جديد', nameEn: 'New', phone: '0599991099', managerId: 'STORE_MANAGER', isApproved: true } });
  await fixture.db.store.create({ data: { id: 'hidden-store', nameAr: 'مخفي', nameEn: 'Hidden', phone: '0599991098', managerId: 'STORE_MANAGER', isApproved: false } });
  await fixture.db.product.create({ data: { id: 'new-product', storeId: 'new-store', nameAr: 'جديد', price: 8 } });
  await fixture.db.product.create({ data: { id: 'hidden-product', storeId: 'hidden-store', nameAr: 'مخفي', price: 9 } });
  const stores = await request<import('@samou-go/shared-types').Paginated<import('@samou-go/shared-types').Store>>('GET', '/stores?sort=newest&limit=2');
  expect(stores.status).toBe(200);
  expect(stores.data.items.map(row => row.id)).toEqual(['new-store', 'store']);
  expect(stores.data.items[1]?.isRecent).toBe(false);
  const products = await request<import('@samou-go/shared-types').DiscoveryProduct[]>('GET', '/stores/new-products?limit=2');
  expect(products.status).toBe(200);
  expect(products.data.map(row => row.id)).toEqual(['new-product', 'product']);
  expect(products.data[1]).toMatchObject({ isRecent: false, hasOptions: true, price: 12.5 });
  const order = await fixture.db.order.findFirstOrThrow({ where: { storeId: 'store' } });
  await fixture.db.rating.upsert({ where: { orderId: order.id }, create: { orderId: order.id, customerId: 'CUSTOMER', storeId: 'store', storeRating: 4 }, update: { storeRating: 4 } });
  const rated = await request<import('@samou-go/shared-types').Paginated<import('@samou-go/shared-types').Store>>('GET', '/stores?sort=rating&limit=1');
  expect(rated.data.items[0]).toMatchObject({ id: 'store', averageRating: 4, ratingCount: 1 });
  expect((await request('GET', '/stores/new-products?limit=100')).status).toBe(422);
  expect((await request('GET', '/stores?sort=newest&limit=0')).status).toBe(422);
});

it('searches the full public product catalogue and samples only eligible products', async () => {
  type Results = { items: import('@samou-go/shared-types').PopularProduct[]; total: number };
  const product = await fixture.db.product.findUniqueOrThrow({ where: { id: 'product' } });
  const response = await request<Results>('GET', `/stores/search-products?search=${encodeURIComponent(product.nameAr)}`);
  expect(response.status).toBe(200);
  expect(response.data.items.find(item => item.id === 'product')).toMatchObject({ price: 12.5, hasOptions: true, optionGroups: [{ items: [{ priceDelta: 3.25 }] }] });
  const sampled = await request<Results>('GET', '/stores/search-products');
  expect(sampled.status).toBe(200);
  expect(sampled.data.items.some(item => item.id === 'hidden-product')).toBe(false);
  expect(new Set(sampled.data.items.map(item => item.id)).size).toBe(sampled.data.items.length);
  expect((await request<Results>('GET', '/stores/search-products?search=zzzzzzzzzz')).data.items).toEqual([]);
  expect((await request('GET', '/stores/search-products?page=0')).status).toBe(422);
});

it('reorders addons at current prices and skips unavailable selections', async () => {
  const original = await fixture.db.order.findFirstOrThrow({ where: { storeId: 'store' }, include: { items: true } });
  const line = original.items[0]!;
  await fixture.db.orderItem.update({ where: { id: line.id }, data: { selectedOptions: [{ id: 'showcase-option', groupId: 'showcase-group', name: 'جبنة', priceDelta: 1 }] } });
  const response = await request<import('@samou-go/shared-types').ReorderResult>('POST', `/orders/${original.id}/reorder`, 'CUSTOMER');
  expect(response.status).toBe(200);
  expect(response.data.items[0]?.selectedOptions).toEqual([{ id: 'showcase-option', groupId: 'showcase-group', name: 'جبنة', priceDelta: 3.25 }]);
  await fixture.db.productOptionItem.update({ where: { id: 'showcase-option' }, data: { isActive: false } });
  const unavailable = await request<import('@samou-go/shared-types').ReorderResult>('POST', `/orders/${original.id}/reorder`, 'CUSTOMER');
  expect(unavailable.data.items).toEqual([]);
  expect(unavailable.data.skipped).toBe(1);
});

it('blocks anonymous order submission while keeping public quotes available', async () => {
  const before = await fixture.db.order.count();
  expect((await request('POST', '/orders', undefined, { guestCustomerInfo: { phone: '0599999000' } })).status).toBe(401);
  expect((await request('POST', '/orders/checkout', undefined, {})).status).toBe(401);
  expect(await fixture.db.order.count()).toBe(before);
});

it('prices from zones only when enabled and snapshots the captain share', async () => {
  await fixture.db.product.create({ data: { id: 'pricing-product', storeId: 'store', nameAr: 'تجربة تسعير', price: 10, isAvailable: true } });
  const body = { storeId: 'store', items: [{ productId: 'pricing-product', quantity: 1 }], deliveryZoneId: 'zone', customerAddressText: 'عنوان اختبار بجانب المتجر' };
  const enabled = await request('PATCH', '/admin/settings/pricing', 'ADMIN', { autoPricingEnabled: true, baseDeliveryFee: 3, captainSharePercentage: 75 });
  expect(enabled.status).toBe(200);
  const quote = await request<import('@samou-go/shared-types').OrderQuote>('POST', '/orders/quote', undefined, body);
  expect(quote.data).toMatchObject({ autoPricingEnabled: true, deliveryFee: 7, totalAmount: 17 });
  const fallback = await request<import('@samou-go/shared-types').OrderQuote>('POST', '/orders/quote', undefined, { ...body, deliveryZoneId: undefined });
  expect(fallback.data.deliveryFee).toBe(3);
  const created = await request<OrderDetail>('POST', '/orders', 'CUSTOMER', body);
  expect(created.status, JSON.stringify(created.error)).toBe(201);
  const saved = await fixture.db.order.findUniqueOrThrow({ where: { id: created.data.id } });
  expect(saved.autoPriced).toBe(true);
  expect(Number(saved.captainSharePercentage)).toBe(75);
  expect((await request('PATCH', `/orders/${saved.id}/set-delivery-fee`, 'ADMIN', { deliveryFee: 99 })).status).toBe(409);
  await fixture.db.store.create({ data: { id: 'pricing-store-two', managerId: 'STORE_MANAGER', nameAr: 'Pricing second store', nameEn: 'Pricing second store', phone: '0599991098', isApproved: true } });
  await fixture.db.product.create({ data: { id: 'pricing-product-two', storeId: 'pricing-store-two', nameAr: 'Second item', price: 10 } });
  for (const fulfillmentType of ['DELIVERY', 'PICKUP']) {
    const checkout = await request<{ orders: { orderId: string; deliveryFee: number }[] }>('POST', '/orders/checkout', 'CUSTOMER', {
      customerAddressText: body.customerAddressText, deliveryZoneId: 'zone',
      stores: [{ storeId: 'store', items: body.items, fulfillmentType }, { storeId: 'pricing-store-two', items: [{ productId: 'pricing-product-two', quantity: 1 }], fulfillmentType }],
    });
    expect(checkout.status, JSON.stringify(checkout.error)).toBe(201);
    expect(checkout.data.orders[0]?.deliveryFee).toBe(fulfillmentType === 'PICKUP' ? 0 : 7);
    expect(checkout.data.orders[0]?.totalAmount).toBe(fulfillmentType === 'PICKUP' ? 10 : 17);
  }

  await request('PATCH', '/admin/settings/pricing', 'ADMIN', { autoPricingEnabled: false, captainSharePercentage: 10 });
  const off = await request<import('@samou-go/shared-types').OrderQuote>('POST', '/orders/quote', undefined, { ...body, deliveryZoneId: undefined });
  expect(off.data.autoPricingEnabled).toBe(false);
  expect(off.data.deliveryFee).toBe(0);
  expect(Number((await fixture.db.order.findUniqueOrThrow({ where: { id: saved.id } })).captainSharePercentage)).toBe(75);
  expect((await request('PATCH', '/admin/settings/pricing', 'CUSTOMER', { autoPricingEnabled: true })).status).toBe(403);
  expect((await request('PATCH', '/admin/settings/pricing', 'ADMIN', { captainSharePercentage: 101 })).status).toBe(422);
});

async function preparationOrder() {
  return fixture.db.order.create({ data: {
    orderNumber: `PREP-${randomUUID()}`, customerId: 'CUSTOMER', storeId: 'store', status: 'PREPARING',
    deliveryZoneId: 'zone', customerAddressText: 'PRIVATE HOUSE', addressNote: 'PRIVATE LANDMARK', orderNote: 'PRIVATE NOTE',
    estimatedPrepMinutes: 20, estimatedReadyAt: new Date(Date.now() + 20 * 60_000),
    subtotal: 10, deliveryFee: 0, totalAmount: 10,
  } });
}

it('allows exactly one early reservation, retains preparation status and masks other captains customer details', async () => {
  const second = await fixture.db.user.create({ data: { id: 'CAPTAIN_TWO', role: 'CAPTAIN', name: 'Second', phone: '0599991077', passwordHash: 'not-used', isActive: true, isVerified: true, isAvailable: true } });
  tokens.CAPTAIN_TWO = signAccessToken({ userId: second.id, role: UserRole.CAPTAIN, phone: second.phone }).accessToken;
  const order = await preparationOrder();
  const route = `/orders/${order.id}`;
  const publicDetail = await request<OrderDetail>('GET', route, 'CAPTAIN');
  expect(publicDetail.status).toBe(200);
  expect(publicDetail.data.customer.phone).toBe('');
  expect(publicDetail.data.customerAddressText).toBe('');
  expect(publicDetail.data.orderNote).toBeNull();
  expect(publicDetail.data.deliveryZone?.id).toBe('zone');
  const results = await Promise.all(['CAPTAIN', 'CAPTAIN_TWO'].map(role => request<OrderDetail>('POST', `${route}/reserve`, role)));
  expect(results.map(result => result.status).sort()).toEqual([200, 409]);
  const winner = (await fixture.db.order.findUniqueOrThrow({ where: { id: order.id } })).captainId!;
  expect(results.find(result => result.status === 200)?.data.status).toBe('PREPARING');
  expect((await request<OrderDetail>('GET', route, winner)).data.customerAddressText).toBe('PRIVATE HOUSE');
  const loser = winner === 'CAPTAIN' ? 'CAPTAIN_TWO' : 'CAPTAIN';
  expect((await request<OrderDetail>('GET', route, loser)).data.customer.phone).toBe('');
  const list = await request<{ items: import('@samou-go/shared-types').OrderSummary[] }>('GET', '/orders?preparationPool=true', loser);
  const listed = list.data.items.find(item => item.id === order.id);
  expect(listed?.captainId).toBe(winner);
  expect(listed?.customerContact).toBeNull();
  expect(listed?.deliveryDestination?.address).toBe('يظهر العنوان بعد حجز التوصيل');
  expect((await request('POST', `${route}/reserve`, winner)).status).toBe(200);
  expect((await request('POST', `${route}/claim`, winner)).status).toBe(400);
  await fixture.db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
});

it('enforces availability, verification, dedicated-store eligibility, role and pickup exclusions', async () => {
  const order = await preparationOrder();
  const route = `/orders/${order.id}/reserve`;
  expect((await request('POST', route, 'CUSTOMER')).status).toBe(403);
  for (const data of [{ isAvailable: false }, { isVerified: false }, { isActive: false }]) {
    await fixture.db.user.update({ where: { id: 'CAPTAIN' }, data });
    expect((await request('POST', route, 'CAPTAIN')).status).toBe('isActive' in data ? 401 : 403);
    await fixture.db.user.update({ where: { id: 'CAPTAIN' }, data: { isAvailable: true, isVerified: true, isActive: true } });
  }
  await fixture.db.user.update({ where: { id: 'CAPTAIN_TWO' }, data: { assignedStoreId: 'store' } });
  expect((await request('POST', route, 'CAPTAIN')).status).toBe(403);
  expect((await request('GET', `/orders/${order.id}`, 'CAPTAIN')).status).toBe(403);
  await fixture.db.user.update({ where: { id: 'CAPTAIN_TWO' }, data: { assignedStoreId: null } });
  await fixture.db.order.update({ where: { id: order.id }, data: { fulfillmentType: 'PICKUP' } });
  expect((await request('POST', route, 'CAPTAIN')).status).toBe(403);
  await fixture.db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
});

it('persists reminders, coordinates workers, reschedules and suppresses cancelled/ready orders', async () => {
  const order = await preparationOrder();
  await fixture.db.platformSettings.upsert({ where: { id: 'platform' }, create: { id: 'platform', preparationReminderMinutes: 5 }, update: { preparationReminderMinutes: 5 } });
  const now = new Date();
  await fixture.db.order.update({ where: { id: order.id }, data: { captainId: 'CAPTAIN', estimatedReadyAt: new Date(now.getTime() + 4 * 60_000) } });
  const pushes = vi.mocked(sendPushToMany);
  pushes.mockClear();
  await Promise.all([dispatchPreparationReminders(now), dispatchPreparationReminders(now)]);
  expect(pushes).toHaveBeenCalledTimes(1);
  expect(pushes).toHaveBeenCalledWith(['CAPTAIN'], expect.objectContaining({ data: expect.objectContaining({ type: 'PREPARATION_REMINDER', orderId: order.id }) }), { dataOnly: true });
  expect((await fixture.db.order.findUniqueOrThrow({ where: { id: order.id } })).prepReminderSentAt).not.toBeNull();
  await dispatchPreparationReminders(now);
  expect(pushes).toHaveBeenCalledTimes(1);
  const changed = await request<OrderDetail>('PATCH', `/orders/${order.id}/preparation-time`, 'STORE_MANAGER', { estimatedPrepMinutes: 20 });
  expect(changed.status).toBe(200);
  expect(Date.parse(changed.data.estimatedReadyAt!)).toBeGreaterThan(now.getTime() + 19 * 60_000);
  await dispatchPreparationReminders(now);
  expect(pushes).toHaveBeenCalledTimes(1);
  for (const status of ['CANCELLED', 'READY_FOR_PICKUP'] as const) {
    await fixture.db.order.update({ where: { id: order.id }, data: { status, estimatedReadyAt: new Date(now.getTime() + 60_000), prepReminderSentAt: null } });
    await dispatchPreparationReminders(now);
    expect(pushes).toHaveBeenCalledTimes(1);
  }
  await fixture.db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
});

it('retries an expired reminder lease after restart and alerts only assigned captain at actual readiness', async () => {
  const order = await preparationOrder();
  const now = new Date();
  const pushes = vi.mocked(sendPushToMany);
  pushes.mockClear();
  await fixture.db.order.update({ where: { id: order.id }, data: { captainId: 'CAPTAIN', estimatedReadyAt: new Date(now.getTime() + 60_000), prepReminderLeaseUntil: new Date(now.getTime() - 1000) } });
  await dispatchPreparationReminders(now);
  expect(pushes).toHaveBeenCalledTimes(1);
  const ready = await request<OrderDetail>('PATCH', `/orders/${order.id}/status`, 'STORE_MANAGER', { status: 'READY_FOR_PICKUP' });
  expect(ready.status).toBe(200);
  await vi.waitFor(() => expect(pushes).toHaveBeenCalledWith(['CAPTAIN'], expect.objectContaining({ data: expect.objectContaining({ type: 'NEW_ORDER', orderId: order.id }) }), { dataOnly: true }));
  await fixture.db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
});

it('schedules on acceptance, validates admin lead time, and reminds the eligible unreserved pool', async () => {
  const order = await preparationOrder();
  await fixture.db.order.update({ where: { id: order.id }, data: { status: 'PENDING', estimatedReadyAt: null } });
  const accepted = await request<OrderDetail>('PATCH', `/orders/${order.id}/status`, 'STORE_MANAGER', { status: 'ACCEPTED', estimatedPrepMinutes: 10 });
  expect(accepted.status).toBe(200);
  expect(Date.parse(accepted.data.estimatedReadyAt!)).toBeGreaterThan(Date.now() + 9 * 60_000);
  expect((await request('PATCH', '/platform/settings', 'CUSTOMER', { preparationReminderMinutes: 5 })).status).toBe(403);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { preparationReminderMinutes: 0 })).status).toBe(422);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { preparationReminderMinutes: 30 })).status).toBe(200);
  // Let fire-and-forget acceptance push finish before checking the scheduler's sends.
  await new Promise(resolve => setTimeout(resolve, 30));
  const pushes = vi.mocked(sendPushToMany); pushes.mockClear();
  await dispatchPreparationReminders();
  expect(pushes).toHaveBeenCalledWith(expect.arrayContaining(['CAPTAIN', 'CAPTAIN_TWO']), expect.objectContaining({ data: expect.objectContaining({ type: 'PREPARATION_REMINDER', orderId: order.id }) }), { dataOnly: true });
  await fixture.db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
});


it('reopens only an owned reservation before pickup and logs one withdrawal under contention', async () => {
  const order = await preparationOrder();
  const route = `/orders/${order.id}`;
  expect((await request('POST', `${route}/reserve`, 'CAPTAIN')).status).toBe(200);
  expect((await request('POST', `${route}/release`, 'CAPTAIN_TWO', { reason: 'تعذر التوصيل' })).status).toBe(403);
  expect((await request('POST', `${route}/release`, 'CUSTOMER', { reason: 'تعذر التوصيل' })).status).toBe(403);
  const attempts = await Promise.all(Array.from({ length: 5 }, () => request('POST', `${route}/release`, 'CAPTAIN', { reason: 'تعذر التوصيل' })));
  expect(attempts.filter(r => r.status === 200)).toHaveLength(1);
  const released = await fixture.db.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(released.captainId).toBeNull();
  expect(released.status).toBe('PREPARING');
  expect(await fixture.db.orderStatusHistory.count({ where: { orderId: order.id } })).toBe(1);
  expect((await request('POST', `${route}/reserve`, 'CAPTAIN_TWO')).status).toBe(200);
  await fixture.db.order.update({ where: { id: order.id }, data: { status: 'ON_THE_WAY' } });
  expect((await request('POST', `${route}/release`, 'CAPTAIN_TWO', { reason: 'تعذر التوصيل' })).status).toBe(409);
});

it('assigns one winner per order under 64 simultaneous reservations', async () => {
  const roles: string[] = [];
  for (let i = 0; i < 8; i++) {
    const id = `stress-captain-${i}`;
    const phone = `059998100${i}`;
    await fixture.db.user.create({ data: { id, phone, role: 'CAPTAIN', name: id, passwordHash: 'unused', isActive: true, isVerified: true, isAvailable: true } });
    tokens[id] = signAccessToken({ userId: id, role: UserRole.CAPTAIN, phone }).accessToken;
    roles.push(id);
  }
  const orders = await Promise.all(Array.from({ length: 8 }, () => preparationOrder()));
  const groups = await Promise.all(orders.map(order => Promise.all(roles.map(role => request('POST', `/orders/${order.id}/reserve`, role)))));
  for (const results of groups) {
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 409)).toHaveLength(7);
  }
  for (const order of orders) expect((await fixture.db.order.findUniqueOrThrow({ where: { id: order.id } })).captainId).not.toBeNull();
}, 20000);

it('keeps notification audit admin-only and accepts an idempotent open from the recipient only', async () => {
  const audit = await fixture.db.notificationDelivery.create({ data: { userId: 'CAPTAIN', title: 'اختبار', type: 'NEW_ORDER', status: 'ACCEPTED' } });
  expect((await request('GET', '/admin/notifications', 'CAPTAIN')).status).toBe(403);
  expect((await request('GET', '/admin/notifications', 'ADMIN')).status).toBe(200);
  const route = `/devices/notifications/${audit.id}/opened`;
  expect((await request('POST', route, 'CUSTOMER')).status).toBe(404);
  expect((await request('POST', route, 'CAPTAIN')).status).toBe(200);
  const first = await fixture.db.notificationDelivery.findUniqueOrThrow({ where: { id: audit.id } });
  expect(first.openedAt).not.toBeNull();
  expect((await request('POST', route, 'CAPTAIN')).status).toBe(200);
  expect((await fixture.db.notificationDelivery.findUniqueOrThrow({ where: { id: audit.id } })).openedAt).toEqual(first.openedAt);
});


it('restricts a captain to multiple stores across profile, pool, reservation, assignment and push recipients', async () => {
  for (const id of ['multi-b', 'multi-c']) await fixture.db.store.create({ data: { id, managerId: 'STORE_MANAGER', nameAr: id, nameEn: id, phone: '0599991099', isApproved: true } });
  const result = await request<import('@samou-go/shared-types').PublicUser>('PATCH', '/users/CAPTAIN', 'ADMIN', { assignedStoreIds: ['store', 'multi-b', 'store'] });
  expect(result.status).toBe(200);
  expect(result.data.assignedStoreIds.sort()).toEqual(['multi-b', 'store']);
  expect((await request<import('@samou-go/shared-types').PublicUser>('GET', '/auth/me', 'CAPTAIN')).data.assignedStoreIds.sort()).toEqual(['multi-b', 'store']);
  for (const id of ['store', 'multi-b']) expect(await eligibleCaptainIds(id)).toContain('CAPTAIN');
  expect(await eligibleCaptainIds('multi-c')).not.toContain('CAPTAIN');
  expect(await eligibleCaptainIds('multi-b')).not.toContain('CAPTAIN_TWO');
  const orders = [];
  for (const storeId of ['store', 'multi-b', 'multi-c']) {
    const order = await preparationOrder();
    await fixture.db.order.update({ where: { id: order.id }, data: { storeId } });
    orders.push(order.id);
    const allowed = storeId !== 'multi-c';
    expect((await request('GET', `/orders/${order.id}`, 'CAPTAIN')).status).toBe(allowed ? 200 : 403);
    expect((await request('POST', `/orders/${order.id}/reserve`, 'CAPTAIN')).status).toBe(allowed ? 200 : 403);
    if (!allowed) expect((await request('PATCH', `/orders/${order.id}/captain`, 'ADMIN', { captainId: 'CAPTAIN' })).status).toBe(422);
  }
  const ready = await request<OrderDetail>('PATCH', `/orders/${orders[1]}/status`, 'ADMIN', { status: 'READY_FOR_PICKUP' });
  expect(ready.status).toBe(200);
  expect((await request('POST', `/orders/${orders[1]}/claim`, 'CAPTAIN', { handoffCode: ready.data.captainHandoffCode })).status).toBe(200);
  expect((await request('PATCH', '/users/CAPTAIN', 'CUSTOMER', { assignedStoreIds: [] })).status).toBe(403);
  expect((await request('PATCH', '/users/CUSTOMER', 'ADMIN', { assignedStoreIds: ['store'] })).status).toBe(422);
  expect((await request('PATCH', '/users/CAPTAIN', 'ADMIN', { assignedStoreIds: ['missing-store'] })).status).toBe(404);
  // Editing the list must not hide a job already reserved by this captain.
  expect((await request('PATCH', '/users/CAPTAIN', 'ADMIN', { assignedStoreIds: ['multi-b'] })).status).toBe(200);
  expect((await request('GET', `/orders/${orders[0]}`, 'CAPTAIN')).status).toBe(200);
  expect(await eligibleCaptainIds('store')).not.toContain('CAPTAIN');
  const cleared = await request<import('@samou-go/shared-types').PublicUser>('PATCH', '/users/CAPTAIN', 'ADMIN', { assignedStoreIds: [] });
  expect(cleared.data.assignedStoreIds).toEqual([]);
  expect(cleared.data.assignedStoreId).toBeNull();
  expect(await eligibleCaptainIds('multi-c')).toContain('CAPTAIN');
  await fixture.db.order.updateMany({ where: { id: { in: orders } }, data: { status: 'CANCELLED' } });
});

it('creates multi-store and general captains and keeps legacy one-store edits compatible', async () => {
  const created = await request<import('@samou-go/shared-types').PublicUser>('POST', '/admin/captains', 'ADMIN', { nameAr: 'كابتن متعدد', nameEn: 'Multi Captain', phone: '0599988880', assignedStoreIds: ['store', 'multi-b'], isVerified: true });
  expect(created.status).toBe(201);
  expect(created.data.assignedStoreIds.sort()).toEqual(['multi-b', 'store']);
  const legacy = await request<import('@samou-go/shared-types').PublicUser>('PATCH', `/users/${created.data.id}`, 'ADMIN', { assignedStoreId: 'multi-c' });
  expect(legacy.data.assignedStoreIds).toEqual(['multi-c']);
  const general = await request<import('@samou-go/shared-types').PublicUser>('POST', '/admin/captains', 'ADMIN', { nameAr: 'كابتن عام', nameEn: 'General Captain', phone: '0599988881', assignedStoreIds: [] });
  expect(general.status).toBe(201);
  expect(general.data.assignedStoreIds).toEqual([]);
});

it('backfills legacy assignments into the relation without duplicate memberships', async () => {
  await fixture.db.user.update({ where: { id: 'CAPTAIN_TWO' }, data: { assignedStoreId: 'store' } });
  const migration = readFileSync(resolve('prisma/migrations/20260910000100_multi_store_captains/migration.sql'), 'utf8');
  const backfill = migration.slice(migration.indexOf('INSERT INTO'));
  await fixture.db.$executeRawUnsafe(backfill);
  await fixture.db.$executeRawUnsafe(backfill);
  const captain = await fixture.db.user.findUniqueOrThrow({ where: { id: 'CAPTAIN_TWO' }, include: { assignedStores: true } });
  expect(captain.assignedStores.map(store => store.id)).toEqual(['store']);
});

it('keeps product variants separate and edits pending quantities with ownership and stale-write protection', async () => {
  await fixture.db.product.create({ data:{ id:'ux-product',storeId:'store',nameAr:'بيتزا اختبار',price:10,isAvailable:true } });
  await fixture.db.productOptionGroup.create({data:{id:'ux-group',productId:'ux-product',name:'إضافات',minSelect:0,maxSelect:2,required:false,items:{create:{id:'ux-cheese',name:'جبنة',price:4,isActive:true}}}});
  const created=await request<OrderDetail>('POST','/orders','CUSTOMER',{storeId:'store',items:[{productId:'ux-product',quantity:1,note:'عادية'},{productId:'ux-product',quantity:2,note:'جبنة',selectedOptions:[{groupId:'ux-group',optionId:'ux-cheese'}]}],customerAddressText:'عنوان فحص تجربة المستخدم',unavailableAction:'SUGGEST'});
  expect(created.status,JSON.stringify(created.error)).toBe(201);
  expect(created.data.items).toHaveLength(2);expect(created.data.subtotal).toBe(38);
  const body={updatedAt:created.data.updatedAt,items:created.data.items.map(i=>({id:i.id,quantity:i.quantity+1,note:i.note??''}))};
  expect((await request('PATCH',`/orders/${created.data.id}/items`,'CAPTAIN',body)).status).toBe(403);
  const edited=await request<OrderDetail>('PATCH',`/orders/${created.data.id}/items`,'CUSTOMER',body);
  expect(edited.status,JSON.stringify(edited.error)).toBe(200);expect(edited.data.subtotal).toBe(62);
  expect((await request('PATCH',`/orders/${created.data.id}/items`,'CUSTOMER',body)).status).toBe(409);
  await request('PATCH',`/orders/${created.data.id}/status`,'STORE_MANAGER',{status:'ACCEPTED'});
  expect((await request('PATCH',`/orders/${created.data.id}/items`,'CUSTOMER',{...body,updatedAt:edited.data.updatedAt})).status).toBe(409);
});
it('requires customer approval for replacement and rejects changed prices or stale decisions', async () => {
  const created=await request<OrderDetail>('POST','/orders','CUSTOMER',{storeId:'store',items:[{productId:'ux-product',quantity:1}],customerAddressText:'عنوان بديل تجريبي'});
  const route=`/orders/${created.data.id}`;
  const body={updatedAt:created.data.updatedAt,items:[{productId:'ux-product',quantity:2}]};
  expect((await request('POST',route+'/change-proposal','CUSTOMER',body)).status).toBe(403);
  const proposal=await request<OrderDetail>('POST',route+'/change-proposal','STORE_MANAGER',body);
  expect(proposal.status,JSON.stringify(proposal.error)).toBe(200);expect(proposal.data.subtotal).toBe(10);
  expect((await request('PATCH',route+'/status','STORE_MANAGER',{status:'ACCEPTED'})).status).toBe(409);
  await fixture.db.product.update({where:{id:'ux-product'},data:{price:11}});
  expect((await request('POST',route+'/change-decision','CUSTOMER',{updatedAt:proposal.data.updatedAt,accept:true})).status).toBe(409);
  const latest=await request<OrderDetail>('GET',route,'CUSTOMER');
  const fresh=await request<OrderDetail>('POST',route+'/change-proposal','STORE_MANAGER',{...body,updatedAt:latest.data.updatedAt});
  const accepted=await request<OrderDetail>('POST',route+'/change-decision','CUSTOMER',{updatedAt:fresh.data.updatedAt,accept:true});
  expect(accepted.status,JSON.stringify(accepted.error)).toBe(200);expect(accepted.data.subtotal).toBe(22);expect(accepted.data.changeProposal).toBeNull();
  expect((await request('POST',route+'/change-decision','CUSTOMER',{updatedAt:fresh.data.updatedAt,accept:true})).status).toBe(409);
});
it('persists marketing preferences only for the signed-in account', async()=>{
  expect((await request('PATCH','/auth/me/notifications',undefined,{marketingNotificationsEnabled:false})).status).toBe(401);
  expect((await request('PATCH','/auth/me/notifications','CUSTOMER',{marketingNotificationsEnabled:false})).status).toBe(200);
  const prefs=await request<{marketingNotificationsEnabled:boolean}>('GET','/auth/me/notifications','CUSTOMER');
  expect(prefs.data.marketingNotificationsEnabled).toBe(false);
  expect((await fixture.db.user.findUniqueOrThrow({where:{id:'STORE_MANAGER'}})).marketingNotificationsEnabled).toBe(true);
});

it('escalates an unclaimed delivery once and ignores assigned jobs',async()=>{
  const order=await preparationOrder();
  const now=new Date();
  await fixture.db.order.update({where:{id:order.id},data:{captainId:null,createdAt:new Date(now.getTime()-11*60_000)}});
  const pushes=vi.mocked(sendPushToMany);pushes.mockClear();
  await dispatchUnclaimedAlerts(now);await dispatchUnclaimedAlerts(now);
  const messages=pushes.mock.calls.filter(call=>call[1].data?.orderId===order.id && call[1].data?.type==='UNCLAIMED_ORDER');
  expect(messages).toHaveLength(1);expect(messages[0]?.[0]).toContain('ADMIN');
});
it('saves separate store and captain ratings and allows correcting the same rating',async()=>{
  const order=await fixture.db.order.findFirstOrThrow({where:{status:'DELIVERED',customerId:'CUSTOMER'}});
  const route=`/platform/orders/${order.id}/rating`;
  expect((await request('POST',route,'CUSTOMER',{storeRating:5,captainRating:3})).status).toBe(201);
  expect((await request('POST',route,'CUSTOMER',{storeRating:4,captainRating:5})).status).toBe(201);
  expect(await fixture.db.rating.findUnique({where:{orderId:order.id}})).toMatchObject({storeRating:4,captainRating:5});
});


it('prices and stores standalone offers without a fake product, including mixed checkout and reorder', async () => {
  await fixture.db.store.update({ where: { id: 'store' }, data: { isAcceptingOrders: true, storeStatus: 'OPEN', isActive: true } });
  await fixture.db.product.update({ where: { id: 'product' }, data: { isAvailable: true, price: 12.5 } });
  const offer = await fixture.db.offer.create({ data: { storeId: 'store', titleAr: 'وجبة عائلية', titleEn: 'Family meal', descriptionAr: '', descriptionEn: '', price: 85 } });
  const item = { productId: `offer:${offer.id}`, isOfferItem: true, offerId: offer.id, offerTitle: 'forged title', quantity: 1 };
  const body = { storeId: 'store', items: [item], customerAddressText: 'Offer test address', fulfillmentType: 'PICKUP' };
  const quote = await request<{ subtotal: number }>('POST', '/orders/quote', 'CUSTOMER', body);
  expect(quote.status, JSON.stringify(quote.error)).toBe(200);
  expect(quote.data.subtotal).toBe(85);
  const created = await request<OrderDetail>('POST', '/orders', 'CUSTOMER', body);
  expect(created.status, JSON.stringify(created.error)).toBe(201);
  expect(created.data.items[0]).toMatchObject({ productId: `offer:${offer.id}`, isOfferItem: true, offerId: offer.id, offerTitle: 'وجبة عائلية', unitPrice: 85 });
  const row = await fixture.db.orderItem.findFirstOrThrow({ where: { orderId: created.data.id } });
  expect(row.productId).toBeNull();
  expect(row.offerId).toBe(offer.id);
  const edited = await request<OrderDetail>('PATCH', `/orders/${created.data.id}/items`, 'CUSTOMER', { updatedAt: created.data.updatedAt, items: [{ id: row.id, quantity: 2 }] });
  expect(edited.status, JSON.stringify(edited.error)).toBe(200);
  expect(edited.data.subtotal).toBe(170);
  await fixture.db.offer.update({ where: { id: offer.id }, data: { price: 90 } });
  const reordered = await request<import('@samou-go/shared-types').ReorderResult>('POST', `/orders/${created.data.id}/reorder`, 'CUSTOMER');
  expect(reordered.status).toBe(200);
  expect(reordered.data.items[0]?.offer?.price).toBe(90);
  const secondStore = await fixture.db.store.create({ data: { managerId: 'STORE_MANAGER', nameAr: 'متجر ثاني للعروض', nameEn: 'Second offer store', phone: '0599991096', isApproved: true } });
  const secondProduct = await fixture.db.product.create({ data: { storeId: secondStore.id, nameAr: 'منتج ثان', price: 3 } });
  expect((await request('POST', '/orders/quote', 'CUSTOMER', { ...body, storeId: secondStore.id })).status).toBe(422);
  const checkout = await request<{ orders: { orderId: string; subtotal: number }[] }>('POST', '/orders/checkout', 'CUSTOMER', {
    customerAddressText: body.customerAddressText,
    stores: [{ storeId: 'store', fulfillmentType: 'PICKUP', items: [item, { productId: 'product', quantity: 1 }] }, { storeId: secondStore.id, fulfillmentType: 'PICKUP', items: [{ productId: secondProduct.id, quantity: 1 }] }],
  });
  expect(checkout.status, JSON.stringify(checkout.error)).toBe(201);
  expect(checkout.data.orders[0]?.subtotal).toBe(102.5);
  const checkoutDetail = await request<OrderDetail>('GET', `/orders/${checkout.data.orders[0]!.orderId}`, 'CUSTOMER');
  expect(checkoutDetail.status, JSON.stringify(checkoutDetail.error)).toBe(200);
  expect(checkoutDetail.data.items.find(line => line.isOfferItem)?.offerTitle).toBe('وجبة عائلية');
  const proposal = await request<OrderDetail>('POST', `/orders/${created.data.id}/change-proposal`, 'STORE_MANAGER', { updatedAt: edited.data.updatedAt, items: [item] });
  expect(proposal.status, JSON.stringify(proposal.error)).toBe(200);
  const approved = await request<OrderDetail>('POST', `/orders/${created.data.id}/change-decision`, 'CUSTOMER', { updatedAt: proposal.data.updatedAt, accept: true });
  expect(approved.status, JSON.stringify(approved.error)).toBe(200);
  expect(approved.data.subtotal).toBe(90);
  expect(approved.data.items[0]?.isOfferItem).toBe(true);
  await fixture.db.offer.delete({ where: { id: offer.id } });
  const historical = await request<OrderDetail>('GET', `/orders/${created.data.id}`, 'CUSTOMER');
  expect(historical.status).toBe(200);
  expect(historical.data.items[0]?.product.nameAr).toBe('وجبة عائلية');
});

it('rejects inactive, future, expired and unpriced offers without creating orders', async () => {
  for (const state of [{ isActive: false }, { startsAt: new Date(Date.now()+86400000) }, { expiresAt: new Date(Date.now()-1000) }, { price: null }, { price: 0 }]) {
    const offer = await fixture.db.offer.create({ data: { storeId: 'store', titleAr: 'عرض', titleEn: 'Offer', descriptionAr: '', descriptionEn: '', price: 55, ...state } });
    const body = { storeId: 'store', items: [{ productId: `offer:${offer.id}`, offerId: offer.id, isOfferItem: true, quantity: 1 }], customerAddressText: 'Unavailable offer test' };
    expect((await request('POST', '/orders/quote', 'CUSTOMER', body)).status).toBe(422);
    expect((await request('POST', '/orders', 'CUSTOMER', body)).status).toBe(422);
    expect(await fixture.db.orderItem.count({ where: { offerId: offer.id } })).toBe(0);
  }
});


it('allocates unique public references concurrently and exposes searchable codes without changing IDs', async () => {
  const codes = await Promise.all(Array.from({ length: 12 }, () => nextPublicCode('CUSTOMER', fixture.db)));
  expect(new Set(codes).size).toBe(12);
  expect(codes.every(code => /^C-[0-9]{5,}$/.test(code))).toBe(true);
  const publicCode = codes[0]!;
  await fixture.db.user.update({ where: { id: 'CUSTOMER' }, data: { publicCode } });
  const me = await request<{ id: string; publicCode: string }>('GET', '/auth/me', 'CUSTOMER');
  expect(me.data).toMatchObject({ id: 'CUSTOMER', publicCode });
  const users = await request<{ items: { id: string }[] }>('GET', `/users?search=${publicCode}`, 'ADMIN');
  expect(users.data.items.map(user => user.id)).toContain('CUSTOMER');
  const storeCode = await nextPublicCode('STORE', fixture.db);
  await fixture.db.store.update({ where: { id: 'store' }, data: { publicCode: storeCode } });
  const stores = await request<{ items: { id: string }[] }>('GET', `/stores?search=${storeCode}`, 'CUSTOMER');
  expect(stores.data.items.map(store => store.id)).toContain('store');
});


it('protects operations telemetry and reports delivery failures and readiness', async () => {
  expect((await request('GET', '/admin/operations')).status).toBe(401);
  expect((await request('GET', '/admin/operations', 'CUSTOMER')).status).toBe(403);
  await fixture.db.notificationDelivery.create({ data: { id: 'ops-failure', userId: 'CAPTAIN', title: 'اختبار', type: 'TEST', status: 'FAILED', failedCount: 1 } });
  const result = await request<{ database: string; notifications: { failed: number }; errors: { scope: string } }>('GET', '/admin/operations', 'ADMIN');
  expect(result.status).toBe(200);
  expect(result.data.database).toBe('reachable');
  expect(result.data.notifications.failed).toBeGreaterThanOrEqual(1);
  expect(result.data.errors.scope).toBe('current-process-last-hour');
  const ready = await fetch(base + '/ready');
  expect(ready.status).toBe(200);
  expect(ready.headers.get('cache-control')).toBe('no-store');
  await fixture.db.notificationDelivery.delete({ where: { id: 'ops-failure' } });
});


it('tracks only assigned active deliveries, changes destination and hides stale or completed locations', async () => {
  await request('PATCH', '/platform/settings', 'ADMIN', { gpsCaptureEnabled: true });
  await fixture.db.order.updateMany({ where: { customerId: 'CUSTOMER', status: 'ON_THE_WAY' }, data: { status: 'DELIVERED' } });
  const created = await request<OrderDetail>('POST', '/orders', 'CUSTOMER', { storeId: 'store', fulfillmentType: 'DELIVERY', customerAddressText: 'عنوان اختبار GPS', latitude: 31.4, longitude: 35.07, items: [{ productId: 'product', quantity: 1 }] });
  expect(created.status).toBe(201);
  const id = created.data.id;
  await fixture.db.store.update({ where: { id: 'store' }, data: { latitude: 31.39, longitude: 35.06 } });
  await fixture.db.order.update({ where: { id }, data: { captainId: 'CAPTAIN', status: 'PREPARING' } });
  expect((await request('PUT', '/platform/captains/me/location', 'CUSTOMER', { orderId: id, lat: 31.395, lng: 35.065 })).status).toBe(403);
  expect((await request('PUT', '/platform/captains/me/location', 'CAPTAIN', { orderId: id, lat: 99, lng: 35 })).status).toBe(422);
  expect((await request('PUT', '/platform/captains/me/location', 'CAPTAIN', { orderId: id, lat: 31.395, lng: 35.065 })).status).toBe(200);
  type Snapshot = { stage: string; location: unknown; distanceMeters: number | null; stale: boolean };
  expect((await request('GET', '/platform/orders/' + id + '/tracking')).status).toBe(401);
  const beforePickup = await request<Snapshot>('GET', '/platform/orders/' + id + '/tracking', 'STORE_MANAGER');
  expect(beforePickup.status).toBe(200); expect(beforePickup.data.stage).toBe('store');
  expect(beforePickup.data.distanceMeters).toBeGreaterThan(0);
  await fixture.db.order.update({ where: { id }, data: { status: 'ON_THE_WAY' } });
  expect((await request<Snapshot>('GET', '/platform/orders/' + id + '/tracking', 'CUSTOMER')).data.stage).toBe('customer');
  await fixture.db.captainLocation.update({ where: { captainId: 'CAPTAIN' }, data: { updatedAt: new Date(Date.now() - 120000) } });
  const stale = await request<Snapshot>('GET', '/platform/orders/' + id + '/tracking', 'CUSTOMER');
  expect(stale.data.stale).toBe(true); expect(stale.data.distanceMeters).toBeNull();
  await fixture.db.order.update({ where: { id }, data: { status: 'DELIVERED' } });
  expect((await request<Snapshot>('GET', '/platform/orders/' + id + '/tracking', 'CUSTOMER')).data.location).toBeNull();
  expect((await request('PUT', '/platform/captains/me/location', 'CAPTAIN', { orderId: id, lat: 31.395, lng: 35.065 })).status).toBe(403);
});

it('supports two dedicated captains and enforces general captain exclusions on reads, reservations and alerts', async () => {
  const storeId = 'pool-exclusion-store';
  await fixture.db.store.create({ data: { id: storeId, managerId: 'STORE_MANAGER', nameAr: 'اختبار حجب', nameEn: 'Exclusion test', phone: '0599991099', isApproved: true } });
  for (const id of ['CAPTAIN', 'CAPTAIN_TWO']) {
    await fixture.db.user.update({ where: { id }, data: { isAvailable: true, isActive: true, isVerified: true } });
    expect((await request('PATCH', `/users/${id}`, 'ADMIN', { assignedStoreIds: [storeId], blockedStoreIds: [] })).status).toBe(200);
  }
  expect(await eligibleCaptainIds(storeId)).toEqual(expect.arrayContaining(['CAPTAIN', 'CAPTAIN_TWO']));
  await request('PATCH', '/users/CAPTAIN', 'ADMIN', { assignedStoreIds: [] });
  expect(await eligibleCaptainIds(storeId)).not.toContain('CAPTAIN');
  await request('PATCH', '/users/CAPTAIN_TWO', 'ADMIN', { assignedStoreIds: [] });
  expect(await eligibleCaptainIds(storeId)).toContain('CAPTAIN');
  const blocked = await request<import('@samou-go/shared-types').PublicUser>('PATCH', '/users/CAPTAIN', 'ADMIN', { blockedStoreIds: [storeId] });
  expect(blocked.status).toBe(200);
  expect(blocked.data.blockedStoreIds).toEqual([storeId]);
  expect(await eligibleCaptainIds(storeId)).not.toContain('CAPTAIN');
  expect(await eligibleCaptainIds(storeId)).toContain('CAPTAIN_TWO');
  const order = await preparationOrder();
  await fixture.db.order.update({ where: { id: order.id }, data: { storeId } });
  expect((await request('GET', `/orders/${order.id}`, 'CAPTAIN')).status).toBe(403);
  expect((await request('POST', `/orders/${order.id}/reserve`, 'CAPTAIN')).status).toBe(403);
  expect((await request('PATCH', `/orders/${order.id}/captain`, 'ADMIN', { captainId: 'CAPTAIN' })).status).toBe(422);
  expect((await request('PATCH', '/users/CAPTAIN', 'CUSTOMER', { blockedStoreIds: [] })).status).toBe(403);
  expect((await request('PATCH', '/users/CAPTAIN', 'ADMIN', { blockedStoreIds: ['missing-store'] })).status).toBe(404);
  expect((await request('PATCH', '/users/CUSTOMER', 'ADMIN', { blockedStoreIds: [storeId] })).status).toBe(422);
  await request('PATCH', '/users/CAPTAIN', 'ADMIN', { blockedStoreIds: [] });
  expect((await request('POST', `/orders/${order.id}/reserve`, 'CAPTAIN')).status).toBe(200);
  await fixture.db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
});

it('saves home banners for admin only and validates image URLs', async () => {
  const homeBanners = [{ id: 'promo-test', title: 'عرض تجريبي', imageUrl: 'https://example.com/banner.jpg', fit: 'contain', positionY: 50, enabled: true }];
  expect((await request('PATCH', '/platform/settings', 'CUSTOMER', { homeBanners })).status).toBe(403);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { homeBanners })).status).toBe(200);
  const settings = await request<{ homeBanners: unknown[] }>('GET', '/platform/settings', 'CUSTOMER');
  expect(settings.data.homeBanners).toEqual(homeBanners);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { homeBanners: [{ ...homeBanners[0], imageUrl: 'javascript:alert(1)' }] })).status).toBe(422);
  const store = await fixture.db.store.findFirstOrThrow();
  const productBanner = { ...homeBanners[0], kind: 'product', storeId: store.id };
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { homeBanners: [{ ...productBanner, storeId: undefined }] })).status).toBe(422);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { homeBanners: [{ ...productBanner, storeId: 'missing-store' }] })).status).toBe(400);
  const manyBanners = Array.from({ length: 15 }, (_, index) => ({ ...productBanner, id: `product-ad-${index}` }));
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { homeBanners: manyBanners })).status).toBe(200);
  expect((await request<{ homeBanners: unknown[] }>('GET', '/platform/settings', 'CUSTOMER')).data.homeBanners).toEqual(manyBanners);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { homeBanners: [] })).status).toBe(200);
  expect((await request<{ homeBanners: unknown[] }>('GET', '/platform/settings', 'CUSTOMER')).data.homeBanners).toEqual([]);
});

it('uploads product and category images through HTTP and persists decodable WebP files', async () => {
  const sharp = (await import('sharp')).default;
  const image = await sharp({ create: { width: 100, height: 80, channels: 3, background: { r: 30, g: 140, b: 100 } } }).png().toBuffer();
  for (const kind of ['product', 'category'] as const) {
    expect((await request('POST', '/uploads/presign', 'CUSTOMER', { kind, resourceId: kind, contentType: 'image/png' })).status).toBe(403);
    const presign = await request<{ key: string }>('POST', '/uploads/presign', 'STORE_MANAGER', { kind, resourceId: kind, contentType: 'image/png' });
    expect(presign.status).toBe(201);
    const raw = await fetch(`${base}/api/v1/uploads/raw/${encodeURIComponent(presign.data.key)}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${tokens.STORE_MANAGER}`, 'Content-Type': 'image/png' }, body: new Uint8Array(image),
    });
    expect(raw.status).toBe(204);
    const finalized = await request<{ url: string }>('POST', '/uploads/finalize', 'STORE_MANAGER', { kind, key: presign.data.key });
    expect(finalized.status, JSON.stringify(finalized.error)).toBe(200);
    const row = kind === 'product' ? await fixture.db.product.findUniqueOrThrow({ where: { id: kind } }) : await fixture.db.category.findUniqueOrThrow({ where: { id: kind } });
    expect(row.imageUrl).toBe(finalized.data.url);
    const path = new URL(finalized.data.url, base).pathname;
    const downloaded = await fetch(`${base}${path}`);
    expect(downloaded.status).toBe(200);
    expect((await sharp(Buffer.from(await downloaded.arrayBuffer())).metadata()).format).toBe('webp');
    const reloaded = kind === 'product' ? await fixture.db.product.findUniqueOrThrow({ where: { id: kind } }) : await fixture.db.category.findUniqueOrThrow({ where: { id: kind } });
    expect(reloaded.imageUrl).toBe(finalized.data.url);
    const removed = await fetch(`${base}/api/v1/uploads/current`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokens.STORE_MANAGER}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, resourceId: kind }) });
    expect(removed.status).toBe(204);
  }
});

it('returns bounded delivery estimates from real delivery history, excluding pickup and insufficient samples', async () => {
  const { deliveryEstimates, estimateDelivery } = await import('../stores/delivery-estimates');
  expect(estimateDelivery([30, 40, 50, 60])).toBeNull();
  expect(estimateDelivery([NaN, -5, 500, 30, 35, 40, 45, 50])).toEqual({ minMinutes: 30, maxMinutes: 50, sampleSize: 5 });
  await fixture.db.store.create({ data: { id: 'eta-store', managerId: 'STORE_MANAGER', nameAr: 'مطعم الوقت', nameEn: 'ETA restaurant', phone: '0599991098', isApproved: true } });
  const createdAt = new Date(Date.now() - 90 * 60000);
  for (let index = 0; index < 6; index++) {
    await fixture.db.order.create({ data: { id: `eta-${index}`, orderNumber: `ETA-${index}`, storeId: 'eta-store', customerId: 'CUSTOMER', status: 'DELIVERED', fulfillmentType: index === 5 ? 'PICKUP' : 'DELIVERY', createdAt, customerAddressText: 'اختبار الوقت', subtotal: 10, deliveryFee: 0, totalAmount: 10, statusHistory: { create: { status: 'DELIVERED', createdAt: new Date(createdAt.getTime() + (30 + index * 5) * 60000) } } } });
  }
  expect((await deliveryEstimates(['eta-store'])).get('eta-store')).toEqual({ minMinutes: 30, maxMinutes: 50, sampleSize: 5 });
  const detail = await request<import('@samou-go/shared-types').StoreWithCatalogue>('GET', '/stores/eta-store', undefined);
  expect(detail.data.deliveryEstimate?.sampleSize).toBe(5);
  const list = await request<import('@samou-go/shared-types').Paginated<import('@samou-go/shared-types').Store>>('GET', '/stores', undefined);
  expect(list.data.items.find(store => store.id === 'eta-store')?.deliveryEstimate?.minMinutes).toBe(30);
});
it('filters active customer orders before pagination and preserves the unavailable-item preference', async () => {
  const created = await request<OrderDetail>('POST', '/orders', 'CUSTOMER', { storeId: 'store', items: [{ productId: 'product', quantity: 1 }], customerAddressText: 'عنوان اختبار', unavailableAction: 'REMOVE' });
  expect(created.status).toBe(201);
  expect(created.data.unavailableAction).toBe('REMOVE');
  const result = await request<import('@samou-go/shared-types').Paginated<import('@samou-go/shared-types').OrderSummary>>('GET', '/orders?activeOnly=true&pageSize=100', 'CUSTOMER');
  expect(result.status).toBe(200);
  expect(result.data.items.some(order => order.id === created.data.id)).toBe(true);
  expect(result.data.items.every(order => order.status !== 'DELIVERED' && order.status !== 'CANCELLED')).toBe(true);
});

it('limits dish discovery and featured selections to food venues without restricting general search', async () => {
  const venues = [
    ['restaurant', 'RESTAURANT', 'المميز'], ['cafe', 'CAFE', 'قهوة'], ['sweets', 'BAKERY_SWEETS', 'حلويات'],
    ['bakery', null, 'مخابز النور'], ['coffee', null, 'كافيه البلد'], ['grocery', 'SUPERMARKET', 'مطعم البقالة'],
    ['shop', 'STORE', 'متجر'], ['butcher', 'BUTCHERY', 'ملحمة'], ['produce', 'VEGETABLES_FRUITS', 'خضار'],
  ] as const;
  for (const [index, [key, storeType, nameAr]] of venues.entries()) {
    await fixture.db.store.create({ data: { id: `dish-${key}`, managerId: 'STORE_MANAGER', nameAr, nameEn: '', storeType, phone: `059888880${index}`, isApproved: true, isActive: true, isAcceptingOrders: true, storeStatus: 'OPEN' } });
    await fixture.db.product.create({ data: { id: `dish-product-${key}`, storeId: `dish-${key}`, nameAr: 'اختبارالأطباق', price: 10, imageUrl: 'https://example.com/dish.jpg', featuredRank: index } });
  }
  const expected = venues.slice(0, 5).map(([key]) => `dish-product-${key}`).sort();
  const searched = await request<{ items: { id: string }[] }>('GET', '/stores/search-products?search=اختبارالأطباق&dishesOnly=true');
  expect(searched.status).toBe(200);
  expect(searched.data.items.map(p => p.id).sort()).toEqual(expected);
  const general = await request<{ items: { id: string }[] }>('GET', '/stores/search-products?search=اختبارالأطباق');
  expect(general.data.items).toHaveLength(9);
  const discovery = await request<{ id: string }[]>('GET', '/stores/new-products?limit=24&dishesOnly=true');
  expect(discovery.status).toBe(200);
  expect(discovery.data.filter(p => p.id.startsWith('dish-product-')).map(p => p.id).sort()).toEqual(expected);
  const featured = await request<{ id: string }[]>('GET', '/stores/featured-products');
  expect(featured.data.filter(p => p.id.startsWith('dish-product-')).map(p => p.id).sort()).toEqual(expected);
  expect((await request('PUT', '/stores/featured-selection', 'ADMIN', { productIds: ['dish-product-grocery'] })).status).toBe(400);
  expect((await request('PUT', '/stores/featured-selection', 'ADMIN', { productIds: expected })).status).toBe(200);
});

it('keeps the empty featured showcase populated with photographed food products only', async () => {
  await fixture.db.product.updateMany({ data: { featuredRank: null } });
  await fixture.db.product.create({ data: { id: 'dish-no-photo', storeId: 'dish-restaurant', nameAr: 'مياه بدون صورة', price: 3 } });
  await fixture.db.product.create({ data: { id: 'dish-empty-photo', storeId: 'dish-restaurant', nameAr: 'صورة فارغة', price: 3, imageUrl: '' } });
  for (const route of ['/stores/featured-products', '/stores/new-products?limit=24&dishesOnly=true']) {
    const result = await request<{ id: string; storeId: string; imageUrl: string | null }[]>('GET', route);
    expect(result.status).toBe(200);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every(p => Boolean(p.imageUrl))).toBe(true);
    expect(result.data.some(p => p.id === 'dish-product-grocery' || p.id === 'dish-no-photo' || p.id === 'dish-empty-photo')).toBe(false);
  }
  expect((await request('PUT', '/stores/featured-selection', 'ADMIN', { productIds: ['dish-product-cafe'] })).status).toBe(200);
  const curated = await request<{ id: string }[]>('GET', '/stores/featured-products');
  expect(curated.data.map(p => p.id)).toEqual(['dish-product-cafe']);
});

it('excludes pictured beverages from food discovery, fallback and admin selection while preserving the store catalogue', async () => {
  await fixture.db.category.create({ data: { id: 'dish-beverages', storeId: 'dish-restaurant', nameAr: 'مشروبات باردة', nameEn: 'Cold drinks' } });
  for (const [id, nameAr, categoryId] of [['water', 'ماء معدني', null], ['cola', 'كوكاكولا', null], ['coffee', 'قهوة عربية', null], ['juice', 'باشن فروت', 'dish-beverages']] as const) {
    await fixture.db.product.create({ data: { id: `pictured-${id}`, nameAr, categoryId, storeId: 'dish-restaurant', price: 5, imageUrl: 'https://example.com/drink.jpg' } });
  }
  await fixture.db.product.updateMany({ data: { featuredRank: null } });
  for (const route of ['/stores/featured-products', '/stores/new-products?limit=24&dishesOnly=true']) {
    const result = await request<{ id: string }[]>('GET', route);
    expect(result.status).toBe(200);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.some(p => p.id.startsWith('pictured-'))).toBe(false);
  }
  expect((await request('PUT', '/stores/featured-selection', 'ADMIN', { productIds: ['pictured-cola'] })).status).toBe(400);
  const search = await request<{ items: { id: string }[] }>('GET', '/stores/search-products?search=كوكاكولا');
  expect(search.data.items.some(p => p.id === 'pictured-cola')).toBe(true);
  const foodSearch = await request<{ items: { id: string }[] }>('GET', '/stores/search-products?search=كوكاكولا&dishesOnly=true');
  expect(foodSearch.data.items).toHaveLength(0);
});

it('persists independent admin category selections and enforces them on both public feeds', async () => {
  for (const [id, storeId] of [['food-main', 'dish-restaurant'], ['food-sweets', 'dish-sweets']] as const) {
    await fixture.db.category.create({ data: { id, storeId, nameAr: id === 'food-main' ? 'وجبات' : 'حلويات', nameEn: id } });
  }
  await fixture.db.product.update({ where: { id: 'dish-product-restaurant' }, data: { categoryId: 'food-main' } });
  await fixture.db.product.update({ where: { id: 'dish-product-sweets' }, data: { categoryId: 'food-sweets' } });
  const body = { discoveryCategoryIds: ['food-main'], featuredCategoryIds: ['food-sweets'] };
  expect((await request('PATCH', '/platform/settings', 'CUSTOMER', body)).status).toBe(403);
  expect((await request('GET', '/stores/dish-category-options', 'CUSTOMER')).status).toBe(403);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { discoveryCategoryIds: ['missing'] })).status).toBe(400);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', body)).status).toBe(200);
  const saved = await request<typeof body>('GET', '/platform/settings');
  expect(saved.data.discoveryCategoryIds).toEqual(body.discoveryCategoryIds);
  expect(saved.data.featuredCategoryIds).toEqual(body.featuredCategoryIds);
  const discovery = await request<{ id: string }[]>('GET', '/stores/new-products?dishesOnly=true');
  expect(discovery.data.map(p => p.id)).toEqual(['dish-product-restaurant']);
  const featured = await request<{ id: string }[]>('GET', '/stores/featured-products');
  expect(featured.data.map(p => p.id)).toEqual(['dish-product-sweets']);
  expect((await request('PUT', '/stores/featured-selection', 'ADMIN', { productIds: ['dish-product-restaurant'] })).status).toBe(400);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { discoveryCategoryIds: [], featuredCategoryIds: [] })).status).toBe(200);
  expect((await request<unknown[]>('GET', '/stores/featured-products')).data).toEqual([]);
  expect((await request<unknown[]>('GET', '/stores/new-products?dishesOnly=true')).data).toEqual([]);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { discoveryCategoryIds: null, featuredCategoryIds: null })).status).toBe(200);
});


it('restricts store type to admins and charges product discounts from database prices', async () => {
  const storeId = 'discount-qa-store';
  await fixture.db.store.create({ data: { id: storeId, managerId: 'STORE_MANAGER', nameAr: 'Discount test', nameEn: 'Discount test', phone: '0599991077', isApproved: true } });
  expect((await request('PATCH', `/stores/${storeId}`, 'STORE_MANAGER', { storeType: 'RESTAURANT' })).status).toBe(403);
  expect((await request('PATCH', `/stores/${storeId}`, 'ADMIN', { storeType: 'RESTAURANT' })).status).toBe(200);
  const product = await request<import('@samou-go/shared-types').Product>('POST', `/stores/${storeId}/products`, 'STORE_MANAGER', { nameAr: 'Discount meal', price: 20, originalPrice: 25 });
  expect(product.status).toBe(201);
  expect(product.data.originalPrice).toBe(25);
  const invalid = await request('PATCH', `/stores/${storeId}/products/${product.data.id}`, 'STORE_MANAGER', { price: 30 });
  expect(invalid.status).toBe(400);
  const order = await request<OrderDetail>('POST', '/orders', 'CUSTOMER', { storeId, items: [{ productId: product.data.id, quantity: 2 }], customerAddressText: 'Discount test delivery address', deliveryZoneId: 'zone' });
  expect(order.status, JSON.stringify(order.error)).toBe(201);
  expect(order.data.subtotal).toBe(40);
  const restored = await request<import('@samou-go/shared-types').Product>('PATCH', `/stores/${storeId}/products/${product.data.id}`, 'STORE_MANAGER', { price: 25, originalPrice: null });
  expect(restored.status).toBe(200);
  expect(restored.data.originalPrice).toBeNull();
  expect(restored.data.price).toBe(25);
});

it('revokes access and refresh immediately on password change and suspension, including after reactivation', async () => {
  const phone = '0599991099';
  const password = 'Session-test-old-2026!';
  await fixture.db.user.create({ data: { id: 'SESSION_TEST', phone, name: 'Session test', role: 'CUSTOMER', passwordHash: await hashPassword(password) } });
  type Session = { accessToken: string; refreshToken: string };
  const first = await request<Session>('POST', '/auth/login', undefined, { phone, password });
  expect(first.status).toBe(200);
  tokens.SESSION_TEST = first.data.accessToken;
  expect((await request('GET', '/auth/me', 'SESSION_TEST')).status).toBe(200);
  expect((await request('PATCH', '/auth/me', 'SESSION_TEST', { currentPassword: password, newPassword: 'Session-test-new-2026!' })).status).toBe(200);
  expect((await request('GET', '/auth/me', 'SESSION_TEST')).status).toBe(401);
  expect((await request('GET', '/orders', 'SESSION_TEST')).status).toBe(401);
  expect((await request('POST', '/auth/refresh', undefined, { refreshToken: first.data.refreshToken })).status).toBe(401);
  const second = await request<Session>('POST', '/auth/login', undefined, { phone, password: 'Session-test-new-2026!' });
  expect(second.status).toBe(200);
  tokens.SESSION_TEST = second.data.accessToken;
  expect((await request('GET', '/auth/me', 'SESSION_TEST')).status).toBe(200);
  expect((await request('PATCH', '/users/SESSION_TEST', 'ADMIN', { isActive: false })).status).toBe(200);
  expect((await request('GET', '/orders', 'SESSION_TEST')).status).toBe(401);
  expect((await request('PATCH', '/users/SESSION_TEST', 'ADMIN', { isActive: true })).status).toBe(200);
  expect((await request('GET', '/auth/me', 'SESSION_TEST')).status).toBe(401);
  expect((await request('POST', '/auth/refresh', undefined, { refreshToken: second.data.refreshToken })).status).toBe(401);
});
it('keeps category artwork independent, supports edits and deletion, and restricts writes to admin', async () => {
  const homeCategories = [{ key: 'pharmacy', ar: 'صيدليات', en: 'Pharmacies', enabled: true, imageUrl: 'https://example.com/category.png', storeIds: ['store'] }];
  expect((await request('PATCH', '/platform/settings', 'STORE_MANAGER', { homeCategories })).status).toBe(403);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { homeCategories })).status).toBe(200);
  await fixture.db.store.update({ where: { id: 'store' }, data: { logoUrl: 'https://example.com/changed-logo.png' } });
  expect((await request<{ homeCategories: unknown[] }>('GET', '/platform/settings', 'CUSTOMER')).data.homeCategories).toEqual(homeCategories);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { homeCategories: [{ ...homeCategories[0], imageUrl: 'javascript:alert(1)' }] })).status).toBe(422);
  expect((await request('PATCH', '/platform/settings', 'ADMIN', { homeCategories: [] })).status).toBe(200);
  expect(await fixture.db.store.findUnique({ where: { id: 'store' } })).not.toBeNull();
});

it('prices a private prescription and converts acceptance exactly once into a normal delivery order', async () => {
  const sharp = (await import('sharp')).default;
  const prescriptionImage = 'data:image/png;base64,' + (await sharp({ create: { width: 100, height: 100, channels: 3, background: 'white' } }).png().toBuffer()).toString('base64');
  await fixture.db.store.create({ data: { id: 'pharmacy-test', nameAr: 'صيدلية تجريبية', nameEn: 'Test pharmacy', managerId: 'STORE_MANAGER', phone: '0599991088', storeType: 'PHARMACY', isApproved: true, isActive: true } });
  const payload = { storeId: 'pharmacy-test', description: 'وصفة تجريبية وليست وصفة حقيقية', prescriptionImage, customerAddressText: 'عنوان تجريبي قرب البلدية', deliveryZoneId: 'zone' };
  expect((await request('POST', '/customer/custom-requests', 'CUSTOMER', { ...payload, prescriptionImage: undefined })).status).toBe(400);
  expect((await request('POST', '/customer/custom-requests', 'CUSTOMER', { ...payload, customerAddressText: undefined })).status).toBe(400);
  const created = await request<{ id: string; hasPrescriptionImage: boolean; prescriptionImage?: string }>('POST', '/customer/custom-requests', 'CUSTOMER', payload);
  expect(created.status, JSON.stringify(created.error)).toBe(200);
  expect(created.data.hasPrescriptionImage).toBe(true);
  expect(created.data.prescriptionImage).toBeUndefined();
  const id = created.data.id;
  expect((await request('GET', `/customer/custom-requests/${id}/image`, 'CAPTAIN')).status).toBe(403);
  expect((await request<{ image: string }>('GET', `/store/custom-requests/${id}/image`, 'STORE_MANAGER')).data.image).toMatch(/^data:image\/webp;base64,/);
  expect((await request('POST', `/store/custom-requests/${id}/offer`, 'CUSTOMER', { offeredPrice: 40 })).status).toBe(403);
  const quoted = await request<{ quotedDeliveryFee: number }>('POST', `/store/custom-requests/${id}/offer`, 'STORE_MANAGER', { offeredPrice: 40, offerNote: 'أدوية الوصفة متوفرة' });
  expect(quoted.status, JSON.stringify(quoted.error)).toBe(200);
  expect(quoted.data.quotedDeliveryFee).toBe(7);
  const accepted = await request<{ orderId: string }>('PATCH', `/customer/custom-requests/${id}/respond`, 'CUSTOMER', { action: 'ACCEPT' });
  expect(accepted.status, JSON.stringify(accepted.error)).toBe(200);
  expect(accepted.data.orderId).toBeTruthy();
  const retry = await request<{ orderId: string }>('PATCH', `/customer/custom-requests/${id}/respond`, 'CUSTOMER', { action: 'ACCEPT' });
  expect(retry.data.orderId).toBe(accepted.data.orderId);
  const order = await fixture.db.order.findUniqueOrThrow({ where: { id: accepted.data.orderId }, include: { items: true } });
  expect(Number(order.totalAmount)).toBe(47); expect(order.items).toHaveLength(1); expect(order.customerAddressText).toBe(payload.customerAddressText);
  expect((await request('PATCH', `/orders/${order.id}/status`, 'STORE_MANAGER', { status: 'ACCEPTED' })).status).toBe(200);
  const second = await request<{ id: string }>('POST', '/customer/custom-requests', 'CUSTOMER', payload);
  await request('POST', `/store/custom-requests/${second.data.id}/offer`, 'STORE_MANAGER', { offeredPrice: 50 });
  const rejected = await request<{ status: string; orderId: string | null }>('PATCH', `/customer/custom-requests/${second.data.id}/respond`, 'CUSTOMER', { action: 'REJECT' });
  expect(rejected.data.status).toBe('REJECTED'); expect(rejected.data.orderId).toBeNull();
  expect((await request('PATCH', `/customer/custom-requests/${second.data.id}/respond`, 'CUSTOMER', { action: 'ACCEPT' })).status).toBe(400);
});

it('does not allow the store request filter to escape manager ownership', async () => {
 await fixture.db.store.create({ data: { id: 'other-pharmacy', nameAr: 'صيدلية أخرى', nameEn: 'Other', phone: '0599991098', managerId: 'ADMIN', storeType: 'PHARMACY' } });
 expect((await request('GET', '/store/custom-requests?storeId=other-pharmacy', 'STORE_MANAGER')).status).toBe(403);
});
it('keeps prescription delivery fee pending for captain-priced zones and rejects other customers reading the image', async () => {
  await fixture.db.platformSettings.update({ where: { id: 'platform' }, data: { autoPricingEnabled: false } });
  await fixture.db.deliveryZone.create({ data: { id: 'rx-dynamic', nameAr: 'منطقة تسعير الكابتن', nameEn: 'Dynamic', deliveryFee: 0, allowCaptainPricing: true } });
  const sharp = (await import('sharp')).default;
  const image = 'data:image/png;base64,' + (await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).png().toBuffer()).toString('base64');
  const created = await request<{ id: string }>('POST', '/customer/custom-requests', 'CUSTOMER', { storeId: 'pharmacy-test', description: 'اختبار رسوم الكابتن', customerAddressText: 'عنوان واضح للاختبار', prescriptionImage: image, deliveryZoneId: 'rx-dynamic' });
  expect(created.status).toBe(200);
  const other = await fixture.db.user.create({ data: { id: 'rx-other-customer', name: 'زبون آخر', phone: '0599991087', passwordHash: 'unused', role: 'CUSTOMER' } });
  tokens.RX_OTHER = signAccessToken({ userId: other.id, role: 'CUSTOMER', phone: other.phone }).accessToken;
  expect((await request('GET', `/customer/custom-requests/${created.data.id}/image`, 'RX_OTHER')).status).toBe(403);
  const quoted = await request<{ deliveryFeePending: boolean; quotedDeliveryFee: number }>('POST', `/store/custom-requests/${created.data.id}/offer`, 'STORE_MANAGER', { offeredPrice: 20 });
  expect(quoted.data.deliveryFeePending).toBe(true); expect(quoted.data.quotedDeliveryFee).toBe(0);
  const accepted = await request<{ orderId: string }>('PATCH', `/customer/custom-requests/${created.data.id}/respond`, 'CUSTOMER', { action: 'ACCEPT' });
  const order = await fixture.db.order.findUniqueOrThrow({ where: { id: accepted.data.orderId } });
  expect(order.isCaptainPriced).toBe(true); expect(order.feeApprovalStatus).toBe('PENDING_CUSTOMER_ACCEPTANCE');
});

it('manages symmetric route prices with role gates, atomic revision checks and server checkout', async () => {
  const db = fixture.db;
  await db.deliveryZone.create({ data: { id: 'route-b', nameAr: 'منطقة ب', nameEn: 'B', deliveryFee: 91 } });
  expect((await request('GET', '/delivery-zones/pricing', 'CUSTOMER')).status).toBe(403);
  const initial = await request<import('@samou-go/shared-types').DeliveryRoutePricing>('GET', '/delivery-zones/pricing', 'ADMIN');
  expect(initial.data.enabled).toBe(false);
  const zones = await db.deliveryZone.findMany({ where: { isActive: true } });
  const rates = zones.flatMap((a, i) => zones.slice(i).map(b => ({ fromZoneId: a.id, toZoneId: b.id, fee: a.id === b.id ? 3 : 11.5 })));
  expect((await request('PUT', '/delivery-zones/pricing', 'STORE_MANAGER', { ...initial.data, rates })).status).toBe(403);
  const incomplete = await request('PUT', '/delivery-zones/pricing', 'ADMIN', { ...initial.data, enabled: true, rates: [] });
  expect(incomplete.status).toBe(422);
  const duplicate = await request('PUT', '/delivery-zones/pricing', 'ADMIN', { ...initial.data, rates: [{ fromZoneId: 'zone', toZoneId: 'route-b', fee: 3 }, { fromZoneId: 'route-b', toZoneId: 'zone', fee: 4 }] });
  expect(duplicate.status).toBe(422);
  expect((await request('PATCH', '/stores/store', 'STORE_MANAGER', { deliveryZoneId: 'missing' })).status).toBe(404);
  expect((await request('PATCH', '/stores/store', 'STORE_MANAGER', { deliveryZoneId: 'zone' })).status).toBe(200);
  await db.store.updateMany({ data: { deliveryZoneId: 'zone', isActive: true, isApproved: true, isAcceptingOrders: true, storeStatus: 'OPEN' } });
  await db.product.update({ where: { id: 'product' }, data: { isAvailable: true } });
  const enabled = await request<import('@samou-go/shared-types').DeliveryRoutePricing>('PUT', '/delivery-zones/pricing', 'ADMIN', { ...initial.data, rates, enabled: true });
  expect(enabled.status, JSON.stringify(enabled.error)).toBe(200);
  try {
    expect((await request('PUT', '/delivery-zones/pricing', 'ADMIN', { ...initial.data, rates })).status).toBe(422);
    const basket = { storeId: 'store', items: [{ productId: 'product', quantity: 1 }], customerAddressText: 'عنوان واضح قرب البلدية', deliveryZoneId: 'route-b' };
    const quote = await request<import('@samou-go/shared-types').OrderQuote>('POST', '/orders/quote', undefined, basket);
    expect(quote.status, JSON.stringify(quote.error)).toBe(200); expect(quote.data.deliveryFee).toBe(11.5);
    await db.store.update({ where: { id: 'store' }, data: { deliveryZoneId: 'route-b' } });
    const reverse = await request<import('@samou-go/shared-types').OrderQuote>('POST', '/orders/quote', undefined, { ...basket, deliveryZoneId: 'zone' });
    expect(reverse.data.deliveryFee).toBe(11.5);
    const same = await request<import('@samou-go/shared-types').OrderQuote>('POST', '/orders/quote', undefined, basket); expect(same.data.deliveryFee).toBe(3);
    const created = await request<OrderDetail>('POST', '/orders', 'CUSTOMER', basket);
    expect(created.status, JSON.stringify(created.error)).toBe(201); expect(created.data.deliveryFee).toBe(3); expect(created.data.autoPriced).toBe(true);
    const pickup = await request<OrderDetail>('POST', '/orders', 'CUSTOMER', { ...basket, fulfillmentType: 'PICKUP', deliveryZoneId: undefined }); expect(pickup.status).toBe(201); expect(pickup.data.deliveryFee).toBe(0);
    const pickupQuote = await request<import('@samou-go/shared-types').OrderQuote>('POST', '/orders/quote', undefined, { ...basket, fulfillmentType: 'PICKUP', deliveryZoneId: undefined }); expect(pickupQuote.status).toBe(200); expect(pickupQuote.data.deliveryFee).toBe(0);
    await db.category.create({ data: { id: 'route-category', nameAr: 'قسم تجريبي', nameEn: 'Route test', storeId: 'pharmacy-test' } });
    await db.product.create({ data: { id: 'route-product', storeId: 'pharmacy-test', categoryId: 'route-category', nameAr: 'اختبار مسار', price: 20 } });
    const multi = await request<{ orders: { orderId: string; deliveryFee: number }[] }>('POST', '/orders/checkout', 'CUSTOMER', { customerAddressText: basket.customerAddressText, deliveryZoneId: 'route-b', stores: [{ storeId: 'store', items: basket.items }, { storeId: 'pharmacy-test', items: [{ productId: 'route-product', quantity: 1 }] }] });
    expect(multi.status, JSON.stringify(multi.error)).toBe(201); expect(multi.data.orders.map(o => o.deliveryFee)).toEqual([3, 11.5]); const multiOrders = await db.order.findMany({ where: { id: { in: multi.data.orders.map(o => o.orderId) } } }); expect(multiOrders.every(o => o.autoPriced && !o.isCaptainPriced)).toBe(true);
    const allPickup = await request<{ totalDeliveryFee: number }>('POST', '/orders/checkout', 'CUSTOMER', { customerAddressText: 'استلام من المتاجر', deliveryZoneId: 'missing-zone', stores: [{ storeId: 'store', fulfillmentType: 'PICKUP', items: basket.items }, { storeId: 'pharmacy-test', fulfillmentType: 'PICKUP', items: [{ productId: 'route-product', quantity: 1 }] }] }); expect(allPickup.status).toBe(201); expect(allPickup.data.totalDeliveryFee).toBe(0);
    const sharp = (await import('sharp')).default;
    const prescriptionImage = 'data:image/png;base64,' + (await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).png().toBuffer()).toString('base64');
    const rx = await request<{ id: string }>('POST', '/customer/custom-requests', 'CUSTOMER', { storeId: 'pharmacy-test', description: 'وصفة اختبار', prescriptionImage, customerAddressText: basket.customerAddressText, deliveryZoneId: 'route-b' }); expect(rx.status).toBe(200);
    const rxQuote = await request<{ quotedDeliveryFee: number }>('POST', `/store/custom-requests/${rx.data.id}/offer`, 'STORE_MANAGER', { offeredPrice: 30 }); expect(rxQuote.data.quotedDeliveryFee).toBe(11.5);
    expect((await request('PATCH', '/admin/settings/pricing', 'STORE_MANAGER', { freeDeliveryEnabled: true })).status).toBe(403);
    expect((await request('PATCH', '/admin/settings/pricing', 'ADMIN', { freeDeliveryEnabled: true })).status).toBe(200);
    const promotionalQuote = await request<import('@samou-go/shared-types').OrderQuote>('POST', '/orders/quote', undefined, basket); expect(promotionalQuote.data.deliveryFee).toBe(0);
    const promotionalOrder = await request<OrderDetail>('POST', '/orders', 'CUSTOMER', basket); expect(promotionalOrder.status).toBe(201); expect(promotionalOrder.data.deliveryFee).toBe(0); expect(promotionalOrder.data.autoPriced).toBe(true);
    expect((await request('PATCH', '/admin/settings/pricing', 'ADMIN', { freeDeliveryEnabled: false })).status).toBe(200);
    expect((await request<import('@samou-go/shared-types').OrderQuote>('POST', '/orders/quote', undefined, basket)).data.deliveryFee).toBe(3);
    expect(Number((await db.order.findUniqueOrThrow({ where: { id: promotionalOrder.data.id } })).deliveryFee)).toBe(0);
    const changed = await request('PUT', '/delivery-zones/pricing', 'ADMIN', { ...enabled.data, rates: enabled.data.rates.map(r => ({ ...r, fee: 0 })) }); expect(changed.status).toBe(200);
    const rxAccepted = await request<{ orderId: string }>('PATCH', `/customer/custom-requests/${rx.data.id}/respond`, 'CUSTOMER', { action: 'ACCEPT' }); expect(rxAccepted.status).toBe(200);
    const rxOrder = await db.order.findUniqueOrThrow({ where: { id: rxAccepted.data.orderId } }); expect(Number(rxOrder.deliveryFee)).toBe(11.5); expect(rxOrder.autoPriced).toBe(true);
    const free = await request<import('@samou-go/shared-types').OrderQuote>('POST', '/orders/quote', undefined, basket); expect(free.data.deliveryFee).toBe(0);
    expect(Number((await db.order.findUniqueOrThrow({ where: { id: created.data.id } })).deliveryFee)).toBe(3);
    expect((await request('POST', '/orders/quote', undefined, { ...basket, deliveryZoneId: undefined })).status).toBe(422);
    await db.deliveryZone.create({ data: { id: 'route-new', nameAr: 'جديدة', nameEn: 'New' } });
    expect((await request('POST', '/orders/quote', undefined, { ...basket, deliveryZoneId: 'route-new' })).status).toBe(422);
  } finally { await db.deliveryPricingConfig.update({ where: { id: 'routes' }, data: { enabled: false } }); await db.platformSettings.update({ where: { id: 'platform' }, data: { freeDeliveryEnabled: false } }); }
});

it('protects all three private conversations, retries, reads, paging and reassignment', async () => {
  const order = await fixture.db.order.create({ data: { orderNumber: 'CHAT-LOCAL-1', customerAddressText: 'Local chat test address', customerId: 'CUSTOMER', storeId: 'store', captainId: 'CAPTAIN', status: 'ACCEPTED', subtotal: 10, deliveryFee: 5, totalAmount: 15 } });
  const route = `/platform/orders/${order.id}/chat`;
  type Message = import('@samou-go/shared-types').OrderChatMessage;
  type Overview = import('@samou-go/shared-types').OrderChatOverview;
  type Page = import('@samou-go/shared-types').OrderChatPage;
  expect((await request('GET', `${route}/peers`)).status).toBe(401);
  const stranger = await fixture.db.user.create({ data: { id: 'CHAT_OTHER', name: 'Other', phone: '0599991088', passwordHash: 'unusable', role: 'CUSTOMER' } });
  tokens.CHAT_OTHER = signAccessToken({ userId: stranger.id, phone: stranger.phone, role: UserRole.CUSTOMER, sessionVersion: 0 }).accessToken;
  expect((await request('GET', `${route}/peers`, 'CHAT_OTHER')).status).toBe(403);
  expect((await request('GET', `${route}/peers`, 'ADMIN')).status).toBe(403);
  expect((await request<Overview>('GET', `${route}/peers`, 'CUSTOMER')).data.peers.map(p => p.id).sort()).toEqual(['CAPTAIN', 'STORE_MANAGER']);
  const body = { recipientId: 'STORE_MANAGER', message: 'مرحبا بخصوص الطلب', clientMessageId: randomUUID() };
  const first = await request<Message>('POST', route, 'CUSTOMER', body); expect(first.status, JSON.stringify(first.error)).toBe(201);
  const retry = await request<Message>('POST', route, 'CUSTOMER', body); expect(retry.data.id).toBe(first.data.id);
  expect((await request('POST', route, 'CUSTOMER', { ...body, message: 'different' })).status).toBe(409);
  expect((await request('POST', route, 'CUSTOMER', { ...body, recipientId: 'CHAT_OTHER', clientMessageId: randomUUID() })).status).toBe(403);
  expect((await request('POST', route, 'CUSTOMER', { ...body, message: ' ', clientMessageId: randomUUID() })).status).toBe(422);
  expect((await request('POST', route, 'CUSTOMER', { ...body, message: 'x'.repeat(2001), clientMessageId: randomUUID() })).status).toBe(422);
  expect((await request<Page>('GET', `${route}?peerId=CUSTOMER`, 'CAPTAIN')).data.items).toHaveLength(0);
  expect((await request<Overview>('GET', `${route}/peers`, 'STORE_MANAGER')).data.peers.find(p => p.id === 'CUSTOMER')?.unread).toBe(1);
  expect((await request('POST', `${route}/read`, 'CAPTAIN', { peerId: 'CUSTOMER', messageId: first.data.id })).status).toBe(400);
  expect((await request('POST', `${route}/read`, 'STORE_MANAGER', { peerId: 'CUSTOMER', messageId: first.data.id })).status).toBe(200);
  expect((await request<Overview>('GET', `${route}/peers`, 'STORE_MANAGER')).data.peers.find(p => p.id === 'CUSTOMER')?.unread).toBe(0);
  expect((await request<Page>('GET', `${route}?peerId=STORE_MANAGER`, 'CUSTOMER')).data.items[0]?.readAt).not.toBeNull();
  for (const [sender, recipientId] of [['CUSTOMER', 'CAPTAIN'], ['CAPTAIN', 'CUSTOMER'], ['STORE_MANAGER', 'CAPTAIN'], ['CAPTAIN', 'STORE_MANAGER'], ['STORE_MANAGER', 'CUSTOMER']]) {
    expect((await request('POST', route, sender, { recipientId, message: '<script>text only</script>', clientMessageId: randomUUID() })).status).toBe(201);
  }
  await fixture.db.chatMessage.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ orderId: order.id, senderId: 'CUSTOMER', recipientId: 'STORE_MANAGER', senderRole: 'CUSTOMER', message: `History ${i}`, createdAt: new Date(Date.now() - 120000 + i) })) });
  const page = await request<Page>('GET', `${route}?peerId=STORE_MANAGER`, 'CUSTOMER'); expect(page.data.items).toHaveLength(50); expect(page.data.nextBefore).toBeTruthy();
  const older = await request<Page>('GET', `${route}?peerId=STORE_MANAGER&before=${page.data.nextBefore}`, 'CUSTOMER'); expect(older.data.items.length).toBeGreaterThan(0); expect(older.data.items.some(m => page.data.items.some(n => n.id === m.id))).toBe(false);
  await fixture.db.order.update({ where: { id: order.id }, data: { captainId: null } });
  expect((await request('GET', `${route}?peerId=CUSTOMER`, 'CAPTAIN')).status).toBe(403);
  await fixture.db.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
  expect((await request('POST', route, 'CUSTOMER', { ...body, clientMessageId: randomUUID() })).status).toBe(400);
  expect((await request<Page>('GET', `${route}?peerId=STORE_MANAGER`, 'CUSTOMER')).status).toBe(200);
});

it('imports the approved 31-area tariff transactionally with corrected names and stable IDs', async () => {
  const { samouTariff } = await import('../zones/samou-tariff');
  await fixture.db.deliveryZone.create({ data: { id: 'old-husaini', nameAr: 'لحصيني', nameEn: 'Husaini', deliveryFee: 7 } });
  await fixture.db.deliveryZone.create({ data: { id: 'excluded-deir', nameAr: 'الدير رافات', nameEn: 'Excluded', deliveryFee: 10 } });
  const config = await request<import('@samou-go/shared-types').DeliveryRoutePricing>('GET', '/delivery-zones/pricing', 'ADMIN');
  expect((await request('POST', '/delivery-zones/pricing/import-samou', 'CUSTOMER', { revision: config.data.revision })).status).toBe(403);
  const imported = await request<import('@samou-go/shared-types').DeliveryRoutePricing>('POST', '/delivery-zones/pricing/import-samou', 'ADMIN', { revision: config.data.revision });
  expect(imported.status, JSON.stringify(imported.error)).toBe(200); expect(imported.data.enabled).toBe(false);
  const zones = await fixture.db.deliveryZone.findMany({ where: { nameAr: { in: [...samouTariff.zones] } } }); expect(zones).toHaveLength(31);
  expect(zones.find(z => z.nameAr === 'الحصيني')?.id).toBe('old-husaini'); expect(zones.some(z => z.nameAr === 'المدورة')).toBe(true);
  expect((await fixture.db.deliveryZone.findUniqueOrThrow({ where: { id: 'excluded-deir' } })).isActive).toBe(false);
  const byName = new Map(zones.map(z => [z.nameAr, z.id]));
  for (const r of samouTariff.rates) {
    const a = byName.get(r.from), b = byName.get(r.to);
    const match = imported.data.rates.find(x => (x.fromZoneId === a && x.toZoneId === b) || (x.fromZoneId === b && x.toZoneId === a)); expect(match?.fee).toBe(r.fee);
  }
  expect((await request('POST', '/delivery-zones/pricing/import-samou', 'ADMIN', { revision: config.data.revision })).status).toBe(422);
  const again = await request('POST', '/delivery-zones/pricing/import-samou', 'ADMIN', { revision: imported.data.revision }); expect(again.status).toBe(200);
  expect(await fixture.db.deliveryZone.count({ where: { nameAr: { in: [...samouTariff.zones] } } })).toBe(31);
});
