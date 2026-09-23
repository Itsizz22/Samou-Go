import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '../../../generated/prisma-sqlite';
import { hashPassword } from '../../lib/password';

const context = vi.hoisted(() => ({ db: null as unknown, rawDir: '', finalDir: '' }));
vi.mock('../../lib/prisma', () => ({ get prisma() { return context.db; } }));
vi.mock('../../uploads/uploads.config', () => ({ uploadDirs: context }));
let db: PrismaClient;
let directory: string;
let passwordHash: string;
let erase: typeof import('./account-deletion').deleteOwnAccount;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'samou-erasure-test-'));
  context.rawDir = path.join(directory, 'raw'); context.finalDir = path.join(directory, 'final');
  const url = `file:${path.join(directory, 'test.db').replaceAll('\\', '/')}`;
  const schemaPath = path.join(directory, 'schema.prisma');
  const schema = await readFile('prisma/schema.sqlite.prisma', 'utf8');
  await writeFile(path.join(directory, 'test.db'), '');
  await writeFile(schemaPath, schema.replace(/url\s*=\s*[^\r\n]+/, 'url = "file:./test.db"'));
  execFileSync(process.execPath, [path.resolve('../../node_modules/prisma/build/index.js'), 'db', 'push', `--schema=${schemaPath}`, '--skip-generate'], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe',
  });
  db = new PrismaClient({ datasources: { db: { url } } }); context.db = db;
  passwordHash = await hashPassword('Deletion-test-only!');
  ({ deleteOwnAccount: erase } = await import('./account-deletion'));
}, 60000);
afterAll(async () => {
  await db?.$disconnect();
  if (directory && path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) await rm(directory, { recursive: true, force: true });
});
async function account(id: string, role: 'CUSTOMER' | 'STORE_MANAGER' | 'CAPTAIN' = 'CUSTOMER') {
  return db.user.create({ data: { id, phone: id, name: 'Private name', passwordHash, role } });
}
describe('permanent account erasure against an isolated real database', () => {
  it('requires the correct password and preserves the account on failure', async () => {
    await account('wrong-password');
    await expect(erase('wrong-password', 'wrong')).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.user.findUnique({ where: { id: 'wrong-password' } })).not.toBeNull();
  });
  it('deletes the user, all sessions, private records and media, while preserving anonymous order totals', async () => {
    const customer = await account('customer');
    const manager = await account('manager', 'STORE_MANAGER');
    const store = await db.store.create({ data: { id: 'store', nameAr: 'QA', nameEn: 'QA', phone: '0590000000', managerId: manager.id } });
    const order = await db.order.create({ data: { id: 'order', orderNumber: 'ERASURE-1', customerId: customer.id, storeId: store.id, status: 'DELIVERED', customerAddressText: 'Private address', orderNote: 'Private note', subtotal: 10, deliveryFee: 5, totalAmount: 15, latitude: 31, longitude: 35, voiceNoteUrl: '/private' } });
    await db.orderItem.create({ data: { orderId: order.id, quantity: 1, unitPrice: 10, totalPrice: 10, note: 'Private item note' } });
    await db.chatMessage.create({ data: { orderId: order.id, senderId: manager.id, recipientId: customer.id, senderRole: 'STORE_MANAGER', message: 'Private message' } });
    await db.rating.create({ data: { orderId: order.id, storeId: store.id, customerId: customer.id, storeRating: 5, comment: 'Private comment' } });
    const session = await db.refreshToken.create({ data: { userId: customer.id, tokenHash: 'test-token-hash', expiresAt: new Date(Date.now() + 86400000) } });
    await db.deviceToken.create({ data: { userId: customer.id, token: 'test-device', platform: 'ios', refreshTokenId: session.id } });
    await db.orderSubmission.create({ data: { customerId: customer.id, requestId: 'request', requestHash: 'hash', response: 'private' } });
    await db.notificationDelivery.create({ data: { userId: customer.id, type: 'ORDER_STATUS', title: 'private' } });
    const key = 'user/customer/avatar.webp';
    await db.storedUpload.create({ data: { key, content: new Uint8Array([1]) } });
    await mkdir(path.join(context.finalDir, 'user/customer'), { recursive: true });
    await writeFile(path.join(context.finalDir, key), 'private');
    await expect(erase(customer.id, 'Deletion-test-only!')).resolves.toEqual({ deleted: true });
    expect(await db.user.findUnique({ where: { id: customer.id } })).toBeNull();
    expect(await db.refreshToken.count({ where: { userId: customer.id } })).toBe(0);
    expect(await db.deviceToken.count({ where: { userId: customer.id } })).toBe(0);
    expect(await db.chatMessage.count()).toBe(0);
    expect(await db.rating.count()).toBe(0);
    expect(await db.orderSubmission.count()).toBe(0);
    expect(await db.notificationDelivery.count()).toBe(0);
    expect(await db.storedUpload.count()).toBe(0);
    await expect(readFile(path.join(context.finalDir, key))).rejects.toMatchObject({ code: 'ENOENT' });
    const retained = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(retained.customerId).not.toBe(customer.id);
    expect(retained.customerAddressText).toBe('محذوف');
    expect(retained.orderNote).toBeNull(); expect(retained.latitude).toBeNull(); expect(retained.voiceNoteUrl).toBeNull();
    expect(retained.items[0]?.note).toBeNull(); expect(Number(retained.totalAmount)).toBe(15);
    // Original phone is no longer reserved, and old account ID cannot sign in.
    await db.user.create({ data: { phone: customer.phone, name: 'New account', passwordHash } });
    await expect(erase(customer.id, 'Deletion-test-only!')).rejects.toMatchObject({ statusCode: 401 });
  });
  it('rejects active orders atomically, then permits captain deletion after completion and retains unlinked financial totals', async () => {
    await account('captain', 'CAPTAIN');
    const customer = await account('active-customer');
    await db.order.create({ data: { id: 'active-order', orderNumber: 'ERASURE-2', customerId: customer.id, captainId: 'captain', storeId: 'store', customerAddressText: 'Address', subtotal: 10, deliveryFee: 5, totalAmount: 15 } });
    await expect(erase('captain', 'Deletion-test-only!')).rejects.toMatchObject({ statusCode: 409 });
    expect((await db.user.findUniqueOrThrow({ where: { id: 'captain' } })).sessionVersion).toBe(0);
    const wallet = await db.wallet.create({ data: { userId: 'captain', balance: 20 } });
    await db.captainLocation.create({ data: { captainId: 'captain', lat: 31, lng: 35 } });
    await db.order.update({ where: { id: 'active-order' }, data: { status: 'DELIVERED' } });
    await erase('captain', 'Deletion-test-only!');
    expect(await db.user.findUnique({ where: { id: 'captain' } })).toBeNull();
    expect(await db.captainLocation.count()).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: 'active-order' } })).captainId).toBeNull();
    const retained = await db.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    expect(retained.userId).toBeNull(); expect(Number(retained.balance)).toBe(20);
  });
  it('deletes a manager and closes the storefront without breaking other customers order history', async () => {
    await erase('manager', 'Deletion-test-only!');
    expect(await db.user.findUnique({ where: { id: 'manager' } })).toBeNull();
    const store = await db.store.findUniqueOrThrow({ where: { id: 'store' } });
    expect(store.isActive).toBe(false); expect(store.phone).toBe(''); expect(store.managerId).not.toBe('manager');
    expect(await db.order.count()).toBe(2);
  });
});
