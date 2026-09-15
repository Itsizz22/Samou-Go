import { mkdtempSync, readFileSync, unlinkSync, rmdirSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { UserRole } from '@samou-go/shared-types';

// Opt-in only. Even an accidental production URL is rejected BEFORE connecting.
const fixture = await vi.hoisted(async () => {
  const raw = process.env.SAMOU_VALIDATION_PG;
  if (!raw) return null;
  const url = new URL(raw);
  if (url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/samou_validation') throw new Error('Only the dedicated local validation PostgreSQL instance is allowed');
  const schema = `validation_${Date.now()}`;
  const { PrismaClient } = await import('../../../generated/prisma-postgres');
  const control = new PrismaClient({ datasourceUrl: url.href });
  await control.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await control.$disconnect();
  url.searchParams.set('schema', schema);
  url.searchParams.set('connection_limit', '12');
  return { db: new PrismaClient({ datasourceUrl: url.href }), schema, url: url.href };
});
vi.mock('../../lib/prisma', async original => ({ ...await original<typeof import('../../lib/prisma')>(), ...(fixture ? { prisma: fixture.db, isPostgresProvider: true } : {}) }));
vi.mock('../../lib/push', () => ({ sendPushToUser: vi.fn(async () => ({ sent: 1, failed: 0 })), sendPushToMany: vi.fn(async () => ({ totalSent: 1, totalFailed: 0 })), isPushEnabled: () => false }));
import { reserveOrder } from './orders.service';
import { registerDeviceToken } from '../devices/devices.service';

beforeAll(async () => {
  if (!fixture) return;
  const directory = mkdtempSync(resolve(tmpdir(), 'samou-pg-ddl-'));
  const sqlFile = resolve(directory, 'schema.sql');
  execFileSync(process.execPath, [resolve('../../node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script', '--output', sqlFile], { encoding: 'utf8' });
  const sql = readFileSync(sqlFile, 'utf8');
  unlinkSync(sqlFile); rmdirSync(directory);
  // Prisma schema DDL contains no procedural bodies. Dedicated fresh schema only.
  for (const statement of sql.split(';').filter(s => s.trim())) await fixture.db.$executeRawUnsafe(statement);
  for (const [i, role] of ['CUSTOMER', 'STORE_MANAGER'].entries()) await fixture.db.user.create({ data: { id: role, phone: `059991000${i}`, name: 'VALIDATION ONLY', role: role as 'CUSTOMER' | 'STORE_MANAGER', passwordHash: 'no-login', isActive: true, isVerified: true } });
}, 30000);
afterAll(async () => { await fixture?.db.$disconnect(); });

async function scenario(prefix: string, count: number, fleet: number) {
  const db = fixture!.db;
  const captainIds = Array.from({ length: fleet }, (_, i) => `${prefix}-captain-${i}`);
  for (const [i, id] of captainIds.entries()) await db.user.create({ data: { id, phone: `${prefix}${i}`, name: 'VALIDATION ONLY', passwordHash: 'no-login', role: 'CAPTAIN', isActive: true, isVerified: true, isAvailable: true } });
  await db.store.create({ data: { id: prefix, managerId: 'STORE_MANAGER', nameAr: 'VALIDATION ONLY', nameEn: 'VALIDATION ONLY', phone: prefix, dedicatedCaptains: { connect: captainIds.map(id => ({ id })) } } });
  const orders = [];
  for (let i=0; i<count; i++) orders.push(await db.order.create({ data: { orderNumber: `${prefix}-${i}`, customerId: 'CUSTOMER', storeId: prefix, status: 'PREPARING', customerAddressText: 'TEST ONLY', subtotal: 10, deliveryFee: 0, totalAmount: 10 } }));
  return { captainIds, orders };
}
for (const count of [10,25,50]) it.skipIf(!fixture)(`PostgreSQL ${count} simultaneous assignments keep capacity and ownership`, async () => {
  const { captainIds, orders } = await scenario(`load${count}`, count, Math.ceil(count / 3));
  const started = performance.now();
  const latencies: number[] = [];
  const results = await Promise.allSettled(orders.map(async (order,i) => {
    const start = performance.now();
    try { return await reserveOrder({ sub: captainIds[i % captainIds.length]!, role: UserRole.CAPTAIN }, order.id); }
    finally { latencies.push(performance.now()-start); }
  }));
  const rows = await fixture!.db.order.findMany({ where: { storeId: `load${count}` } });
  const loads = captainIds.map(id => rows.filter(row => row.captainId === id).length);
  const unexpected = results.filter(result => result.status === 'rejected' && ![403,409].includes(result.reason?.statusCode));
  expect(unexpected).toHaveLength(0);
  expect(Math.max(...loads)).toBeLessThanOrEqual(3);
  const history = await fixture!.db.orderStatusHistory.groupBy({ by: ['orderId'], where: { orderId: { in: orders.map(o=>o.id) } }, _count: { _all: true } });
  expect(history.every(row => row._count._all === 1)).toBe(true);
  expect(rows.filter(row=>row.captainId).length).toBe(results.filter(result=>result.status==='fulfilled').length);
  latencies.sort((a,b)=>a-b);
  const result = { scenario: count, captains: captainIds.length, assigned: loads.reduce((a,b)=>a+b,0), rejected: results.filter(r=>r.status==='rejected').length, durationMs: Math.round(performance.now()-started), p95AssignmentMs: Math.round(latencies[Math.floor(latencies.length*.95)]!), maxActive: Math.max(...loads), duplicateAssignments: 0 };
  appendFileSync(resolve('../../outputs/launch-validation/postgres-metrics.jsonl'), JSON.stringify(result) + '\n');
}, 60000);
it.skipIf(!fixture)('PostgreSQL two captains race for the same order', async () => {
  const { captainIds, orders } = await scenario('race', 1, 2);
  const results = await Promise.allSettled(captainIds.map(sub => reserveOrder({ sub, role: UserRole.CAPTAIN }, orders[0]!.id)));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(await fixture!.db.orderStatusHistory.count({ where: { orderId: orders[0]!.id } })).toBe(1);
});
it.skipIf(!fixture)('PostgreSQL twenty simultaneous first device registrations create one token', async () => {
  await Promise.all(Array.from({ length: 20 }, () => registerDeviceToken('CUSTOMER', { token: 'local-test-token', platform: 'web' })));
  expect(await fixture!.db.deviceToken.count({ where: { token: 'local-test-token' } })).toBe(1);
});
