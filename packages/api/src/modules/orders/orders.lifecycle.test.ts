import { randomUUID } from 'node:crypto';
import { UserRole } from '@samou-go/shared-types';
import { signAccessToken } from '../../lib/jwt';
import { dispatchPreparationReminders } from './preparation-reminders';
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
    const checkout = await request<{ orders: OrderDetail[] }>('POST', '/orders/checkout', 'CUSTOMER', {
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
    expect((await request('POST', route, 'CAPTAIN')).status).toBe(403);
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
