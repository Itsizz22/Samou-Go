#!/usr/bin/env tsx
/**
 * As-Samou E2E Seed — `npm run seed:e2e` (SQLite) / `npm run seed:e2e:pg` (PostgreSQL)
 *
 * Populates the database with realistic Arabic-localized test data for the
 * three local As-Samou stores: verified captains, test customers (including
 * the 0598300517 and 0566010623 logins), and every order lifecycle stage.
 *
 * NON-DESTRUCTIVE & IDEMPOTENT:
 *   • NEVER deletes, wipes, or truncates any existing table or custom record.
 *   • Every model is seeded via find-or-create against a NATURAL unique key:
 *       - User     → `phone`
 *       - Store    → `slug`
 *       - Category → composite `[storeId, nameEn]`
 *       - etc.     → deterministic `e2e-test-*` ids (re-run updates, never dups)
 *   • If a record already exists AND was created by this script (id starts
 *     with `e2e-test`), its managed fields are refreshed. If it belongs to
 *     a customer's existing data, it is left UNTOUCHED — including its password.
 *   • Test accounts created fresh are given password `Password123!`.
 *
 * DATABASE TARGET:
 *   • If DATABASE_URL is set and starts with `postgresql://` or `postgres://`,
 *     the script seeds the PostgreSQL database (e.g. Neon).
 *   • Otherwise, falls back to the local SQLite client.
 *
 * Usage:
 *   cd packages/api
 *   npm run seed:e2e          # SQLite (local dev)
 *   npm run seed:e2e:pg       # PostgreSQL (Neon / production)
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

import { hashPassword, verifyPassword } from '../lib/password';
import {
  generateStoreSlug,
  generateCustomerCode,
  type StoreType,
  type StoreStatus,
  type UserRole,
  type OrderStatus,
  type FulfillmentType,
} from '@samou-go/shared-types';
import { createHash } from 'node:crypto';

// ─── Dynamic Prisma Client Selection ────────────────────────────────────────
// When DATABASE_URL targets PostgreSQL, use the postgres-generated client;
// otherwise fall back to the SQLite client for local development.

const databaseUrl = process.env.DATABASE_URL ?? '';
const usePostgres = /^postgres(ql)?:\/\//.test(databaseUrl);

// The two generated clients are structurally identical; we resolve the right one
// lazily inside main() to avoid top-level await (CJS/tsx incompatibility).
let prisma: any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function resolvePrismaClient(): Promise<void> {
  if (usePostgres) {
    const mod = await import('../../generated/prisma-postgres/index.js');
    prisma = new mod.PrismaClient();
  } else {
    const mod = await import('../../generated/prisma-sqlite/index.js');
    prisma = new mod.PrismaClient();
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TEST_PREFIX = 'e2e-test'; // prefix for all test data IDs
const DEFAULT_PASSWORD = 'Password123!';
const AS_SAMOU_STORE_NAMES = ['مطعم ومشويات القدس', 'سوبرماركت البركة', 'حلويات البلدة القديمة'];

function deterministicSeed(value: string): number {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 8);
  return parseInt(hex, 16) % 32_768;
}

// ─── Order Number Generation ────────────────────────────────────────────────

const UNAMBIGUOUS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function encodeSequence(seq: number): string {
  let v = seq;
  let result = '';
  for (let i = 0; i < 4; i++) {
    result = UNAMBIGUOUS[v % 32] + result;
    v = Math.floor(v / 32);
  }
  return result;
}

function formatOrderNumber(date: Date, sequence: number): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `SQ-${yy}${mm}${dd}-${encodeSequence(sequence)}`;
}

// ─── Target Detection ───────────────────────────────────────────────────────

function printTarget(): void {
  if (usePostgres) {
    // Mask password in the URL for display
    const masked = databaseUrl.replace(/:[^:@]+@/, ':***@');
    console.log(`   Target DB : PostgreSQL (${masked})`);
  } else {
    const dbFile = path.resolve(__dirname, '../../prisma/dev.db');
    console.log(`   Target DB : SQLite ${dbFile}`);
  }
  console.log(`   NODE_ENV  : ${process.env.NODE_ENV ?? '(unset → development)'}\n`);
}

// ─── Platform Settings ──────────────────────────────────────────────────────

async function seedPlatformSettings(): Promise<void> {
  console.log('⚙️  Seeding platform settings…');

  await prisma.platformSettings.upsert({
    where: { id: 'platform' },
    update: {
      gpsCaptureEnabled: true,
      whatsappSupportNumber: '+970590000000',
      isDriverDynamicFeeEnabled: true,
      enableDeliveryZones: true,
      storeCommissionRate: 0.10,
      captainDeliveryRate: 2,
    },
    create: {
      id: 'platform',
      gpsCaptureEnabled: true,
      whatsappSupportNumber: '+970590000000',
      isDriverDynamicFeeEnabled: true,
      enableDeliveryZones: true,
      storeCommissionRate: 0.10,
      captainDeliveryRate: 2,
    },
  });

  console.log('  ✅ Platform settings configured\n');
}

// ─── Delivery Zones ─────────────────────────────────────────────────────────

async function seedDeliveryZones(): Promise<void> {
  console.log('🗺️  Seeding delivery zones…');

  const zones = [
    { id: `${TEST_PREFIX}-zone-central`, nameAr: 'المنطقة الوسطى', nameEn: 'Central Zone', fee: 10, sortOrder: 1 },
    { id: `${TEST_PREFIX}-zone-east`, nameAr: 'المنطقة الشرقية', nameEn: 'Eastern Zone', fee: 15, sortOrder: 2 },
    { id: `${TEST_PREFIX}-zone-west`, nameAr: 'المنطقة الغربية', nameEn: 'Western Zone', fee: 12, sortOrder: 3 },
  ];

  for (const zone of zones) {
    await prisma.deliveryZone.upsert({
      where: { id: zone.id },
      update: { deliveryFee: zone.fee },
      create: {
        id: zone.id,
        nameAr: zone.nameAr,
        nameEn: zone.nameEn,
        deliveryFee: zone.fee,
        sortOrder: zone.sortOrder,
        isActive: true,
      },
    });
  }

  console.log('  ✅ 3 delivery zones created\n');
}

// ─── Users ──────────────────────────────────────────────────────────────────

interface UserSpec {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  isVerified: boolean;
  isAvailable: boolean;
  userCode?: string;
}

type UserSeedState = 'created' | 'updated' | 'kept';

interface ResolvedUser {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  isVerified: boolean;
  password: string | null;
  state: UserSeedState;
}

async function findOrCreateUser(spec: UserSpec, passwordHash: string): Promise<ResolvedUser> {
  const existing = await prisma.user.findUnique({ where: { phone: spec.phone } });

  if (existing) {
    const ours = existing.id.startsWith(TEST_PREFIX);
    if (!ours) {
      // Belongs to the customer's data — keep untouched (incl. password).
      return {
        id: existing.id,
        phone: spec.phone,
        name: existing.name,
        role: existing.role,
        isActive: existing.isActive,
        isVerified: existing.isVerified,
        password: null,
        state: 'kept',
      };
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: spec.name,
        passwordHash,
        role: spec.role,
        isActive: spec.isActive,
        isVerified: spec.isVerified,
        isAvailable: spec.isAvailable,
      },
    });
    return { id: existing.id, phone: spec.phone, name: spec.name, role: spec.role, isActive: spec.isActive, isVerified: spec.isVerified, password: DEFAULT_PASSWORD, state: 'updated' };
  }

  const created = await prisma.user.create({
    data: {
      id: spec.id,
      name: spec.name,
      phone: spec.phone,
      passwordHash,
      role: spec.role,
      isActive: spec.isActive,
      isVerified: spec.isVerified,
      isAvailable: spec.isAvailable,
      userCode: spec.userCode,
    },
  });

  return { id: created.id, phone: spec.phone, name: spec.name, role: spec.role, isActive: spec.isActive, isVerified: spec.isVerified, password: DEFAULT_PASSWORD, state: 'created' };
}

async function seedUsers(): Promise<{
  admin: ResolvedUser;
  manager1: ResolvedUser;
  manager2: ResolvedUser;
  manager3: ResolvedUser;
  captainA: ResolvedUser;
  captainB: ResolvedUser;
  captainC: ResolvedUser;
  customer1: ResolvedUser;
  customer2: ResolvedUser;
  customer3: ResolvedUser;
  customer4: ResolvedUser;
  customer5: ResolvedUser;
  list: ResolvedUser[];
}> {
  console.log('👤 Seeding users (find-or-create by phone)…');

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  const specs: UserSpec[] = [
    // ── Admin / Store Manager (dual role — phone 0566010623) ──
    { id: `${TEST_PREFIX}-user-admin`, name: 'مدير النظام (E2E)', phone: '0566010623', role: 'ADMIN', isActive: true, isVerified: true, isAvailable: false },
    // ── Store Managers ──
    { id: `${TEST_PREFIX}-user-manager1`, name: 'مدير المتجر الأول (E2E)', phone: '0599000002', role: 'STORE_MANAGER', isActive: true, isVerified: true, isAvailable: false },
    { id: `${TEST_PREFIX}-user-manager2`, name: 'مدير المتجر الثاني (E2E)', phone: '0599000003', role: 'STORE_MANAGER', isActive: true, isVerified: true, isAvailable: false },
    { id: `${TEST_PREFIX}-user-manager3`, name: 'مدير متجر الحلويات (E2E)', phone: '0599000010', role: 'STORE_MANAGER', isActive: true, isVerified: true, isAvailable: false },
    // ── Captains ──
    { id: `${TEST_PREFIX}-user-captain-a`, name: 'كابتن أحمد (E2E)', phone: '0599000004', role: 'CAPTAIN', isActive: true, isVerified: true, isAvailable: true },
    { id: `${TEST_PREFIX}-user-captain-b`, name: 'كابتن سعيد (E2E)', phone: '0599000005', role: 'CAPTAIN', isActive: true, isVerified: false, isAvailable: false },
    { id: `${TEST_PREFIX}-user-captain-c`, name: 'كابتن خالد (E2E)', phone: '0599000006', role: 'CAPTAIN', isActive: false, isVerified: true, isAvailable: false },
    // ── Customers ──
    { id: `${TEST_PREFIX}-user-customer1`, name: 'عميل فاطمة (E2E)', phone: '0599000007', role: 'CUSTOMER', isActive: true, isVerified: true, isAvailable: false, userCode: generateCustomerCode(deterministicSeed('0599000007')) },
    { id: `${TEST_PREFIX}-user-customer2`, name: 'عميل جديد (E2E)', phone: '0599000008', role: 'CUSTOMER', isActive: true, isVerified: true, isAvailable: false, userCode: generateCustomerCode(deterministicSeed('0599000008')) },
    { id: `${TEST_PREFIX}-user-customer3`, name: 'عميل متكرر (E2E)', phone: '0599000009', role: 'CUSTOMER', isActive: true, isVerified: true, isAvailable: false, userCode: generateCustomerCode(deterministicSeed('0599000009')) },
    // ── Key test customer: 0598300517 ──
    { id: `${TEST_PREFIX}-user-customer4`, name: 'عميل سامو (E2E)', phone: '0598300517', role: 'CUSTOMER', isActive: true, isVerified: true, isAvailable: false, userCode: generateCustomerCode(deterministicSeed('0598300517')) },
    { id: `${TEST_PREFIX}-user-customer5`, name: 'عميل إضافي (E2E)', phone: '0599000011', role: 'CUSTOMER', isActive: true, isVerified: true, isAvailable: false, userCode: generateCustomerCode(deterministicSeed('0599000011')) },
  ];

  const resolved = [];
  for (const spec of specs) {
    resolved.push(await findOrCreateUser(spec, passwordHash));
  }

  const states = resolved.map((u: ResolvedUser) => u.state);
  console.log(`  ✅ ${specs.length} test phone numbers resolved (${states.filter(s => s === 'created').length} created, ${states.filter(s => s === 'updated').length} refreshed, ${states.filter(s => s === 'kept').length} already existed — untouched)\n`);

  if (resolved.length !== specs.length) {
    throw new Error('User seeding did not resolve every test phone.');
  }
  const admin = resolved[0]!;
  const manager1 = resolved[1]!;
  const manager2 = resolved[2]!;
  const manager3 = resolved[3]!;
  const captainA = resolved[4]!;
  const captainB = resolved[5]!;
  const captainC = resolved[6]!;
  const customer1 = resolved[7]!;
  const customer2 = resolved[8]!;
  const customer3 = resolved[9]!;
  const customer4 = resolved[10]!;
  const customer5 = resolved[11]!;
  return { admin, manager1, manager2, manager3, captainA, captainB, captainC, customer1, customer2, customer3, customer4, customer5, list: resolved };
}

// ─── Stores ─────────────────────────────────────────────────────────────────

interface StoreSpec {
  id: string;
  managerId: string;
  nameAr: string;
  nameEn: string;
  phone: string;
  storeType: StoreType;
  storeStatus: StoreStatus;
  slug: string;
}

type StoreSeedState = 'created' | 'updated' | 'kept';

interface ResolvedStore {
  id: string;
  nameAr: string;
  storeStatus: StoreStatus;
  state: StoreSeedState;
}

async function findOrCreateStore(spec: StoreSpec): Promise<ResolvedStore> {
  const existing = await prisma.store.findUnique({ where: { slug: spec.slug } });

  if (existing) {
    const ours = existing.id.startsWith(TEST_PREFIX);
    if (!ours) {
      return { id: existing.id, nameAr: existing.nameAr, storeStatus: existing.storeStatus, state: 'kept' };
    }
    await prisma.store.update({
      where: { id: existing.id },
      data: {
        managerId: spec.managerId,
        storeStatus: spec.storeStatus,
        storeType: spec.storeType,
        isAcceptingOrders: spec.storeStatus === 'OPEN',
      },
    });
    return { id: existing.id, nameAr: spec.nameAr, storeStatus: spec.storeStatus, state: 'updated' };
  }

  await prisma.store.create({
    data: {
      id: spec.id,
      managerId: spec.managerId,
      nameAr: spec.nameAr,
      nameEn: spec.nameEn,
      phone: spec.phone,
      storeType: spec.storeType,
      storeStatus: spec.storeStatus,
      slug: spec.slug,
      isActive: true,
      isApproved: true,
      isAcceptingOrders: spec.storeStatus === 'OPEN',
    },
  });

  return { id: spec.id, nameAr: spec.nameAr, storeStatus: spec.storeStatus, state: 'created' };
}

async function seedStores(manager1Id: string, manager2Id: string, manager3Id: string): Promise<{
  store1: ResolvedStore;
  store2: ResolvedStore;
  store3: ResolvedStore;
}> {
  console.log('🏪 Seeding stores (find-or-create by slug)…');

  const specs: StoreSpec[] = [
    {
      id: `${TEST_PREFIX}-store-restaurant`, managerId: manager1Id,
      nameAr: 'مطعم ومشويات القدس', nameEn: 'Al-Quds Restaurant & Grill',
      phone: '0599100001', storeType: 'RESTAURANT', storeStatus: 'OPEN',
      slug: generateStoreSlug('مطعم ومشويات القدس'),
    },
    {
      id: `${TEST_PREFIX}-store-supermarket`, managerId: manager2Id,
      nameAr: 'سوبرماركت البركة', nameEn: 'Al-Baraka Supermarket',
      phone: '0599100002', storeType: 'SUPERMARKET', storeStatus: 'OPEN',
      slug: generateStoreSlug('سوبرماركت البركة'),
    },
    {
      id: `${TEST_PREFIX}-store-sweets`, managerId: manager3Id,
      nameAr: 'حلويات البلدة القديمة', nameEn: 'Old City Sweets',
      phone: '0599100003', storeType: 'BAKERY_SWEETS', storeStatus: 'CLOSED',
      slug: generateStoreSlug('حلويات البلدة القديمة'),
    },
  ];

  const seededStores = await Promise.all(specs.map(findOrCreateStore));
  const store1 = seededStores[0];
  const store2 = seededStores[1];
  const store3 = seededStores[2];
  if (!store1 || !store2 || !store3) {
    throw new Error('Store seeding did not resolve all three As-Samou stores.');
  }

  console.log('  ✅ AS-SAMOU STORES:');
  for (const store of [store1, store2, store3]) {
    const tag = store.state === 'created' ? '✅ created' : store.state === 'updated' ? '↻ refreshed' : '♻ kept (untouched)';
    console.log(`  • ${store.nameAr} — ${store.storeStatus} [${tag}]`);
  }
  console.log();

  return { store1, store2, store3 };
}

// ─── Categories & Products ──────────────────────────────────────────────────

async function upsertCategory(storeId: string, spec: { id: string; nameAr: string; nameEn: string; sortOrder: number }): Promise<string> {
  const existing = await prisma.category.findUnique({ where: { storeId_nameEn: { storeId, nameEn: spec.nameEn } } });
  if (existing) return existing.id;
  await prisma.category.upsert({
    where: { id: spec.id },
    update: { nameAr: spec.nameAr, sortOrder: spec.sortOrder },
    create: { id: spec.id, nameAr: spec.nameAr, nameEn: spec.nameEn, storeId, sortOrder: spec.sortOrder },
  });
  return spec.id;
}

async function seedCatalog(store1Id: string, store2Id: string, store3Id: string): Promise<{
  store1CategoryIds: string[];
  products: { id: string; storeId: string; nameAr: string; price: number }[];
}> {
  console.log('📦 Seeding categories & products…');

  // Store 1: Restaurant categories
  const cat1 = await upsertCategory(store1Id, { id: `${TEST_PREFIX}-cat-appetizers`, nameAr: 'مقبلات', nameEn: 'Appetizers', sortOrder: 1 });
  const cat2 = await upsertCategory(store1Id, { id: `${TEST_PREFIX}-cat-grills`, nameAr: 'مشاوي', nameEn: 'Grills', sortOrder: 2 });
  const cat3 = await upsertCategory(store1Id, { id: `${TEST_PREFIX}-cat-drinks`, nameAr: 'مشروبات', nameEn: 'Drinks', sortOrder: 3 });

  // Store 1 products (10 items)
  const store1Products = [
    { id: `${TEST_PREFIX}-prod-hummus`, nameAr: 'حمص بالطحينة', price: 12, categoryId: cat1 },
    { id: `${TEST_PREFIX}-prod-falafel`, nameAr: 'فلافل', price: 8, categoryId: cat1 },
    { id: `${TEST_PREFIX}-prod-tabouleh`, nameAr: 'تبولة', price: 10, categoryId: cat1 },
    { id: `${TEST_PREFIX}-prod-shawarma`, nameAr: 'شاورما دجاج', price: 22, categoryId: cat2 },
    { id: `${TEST_PREFIX}-prod-kebab`, nameAr: 'كباب لحم', price: 35, categoryId: cat2 },
    { id: `${TEST_PREFIX}-prod-mixed-grill`, nameAr: 'مشكل مشاوي', price: 65, categoryId: cat2 },
    { id: `${TEST_PREFIX}-prod-chicken`, nameAr: 'دجاج مشوي', price: 45, categoryId: cat2 },
    { id: `${TEST_PREFIX}-prod-lamb`, nameAr: 'ريش غنم', price: 55, categoryId: cat2 },
    { id: `${TEST_PREFIX}-prod-coke`, nameAr: 'كوكاكولا', price: 5, categoryId: cat3 },
    { id: `${TEST_PREFIX}-prod-water`, nameAr: 'ماء معدني', price: 3, categoryId: cat3 },
  ];

  // Store 2 products (15 items)
  const store2Products = [
    { id: `${TEST_PREFIX}-prod-bread`, nameAr: 'خبز عربي', price: 2, categoryId: null },
    { id: `${TEST_PREFIX}-prod-rice`, nameAr: 'أرز بسمتي', price: 18, categoryId: null },
    { id: `${TEST_PREFIX}-prod-oil`, nameAr: 'زيت زيتون', price: 35, categoryId: null },
    { id: `${TEST_PREFIX}-prod-sugar`, nameAr: 'سكر أبيض', price: 8, categoryId: null },
    { id: `${TEST_PREFIX}-prod-flour`, nameAr: 'دقيق أبيض', price: 6, categoryId: null },
    { id: `${TEST_PREFIX}-prod-milk`, nameAr: 'حليب طازج', price: 7, categoryId: null },
    { id: `${TEST_PREFIX}-prod-cheese`, nameAr: 'جبنة بيضاء', price: 15, categoryId: null },
    { id: `${TEST_PREFIX}-prod-yogurt`, nameAr: 'لبن رائب', price: 5, categoryId: null },
    { id: `${TEST_PREFIX}-prod-eggs`, nameAr: 'بيض بلدي', price: 12, categoryId: null },
    { id: `${TEST_PREFIX}-prod-chicken-breast`, nameAr: 'صدر دجاج', price: 28, categoryId: null },
    { id: `${TEST_PREFIX}-prod-tomatoes`, nameAr: 'طماطم', price: 4, categoryId: null },
    { id: `${TEST_PREFIX}-prod-cucumbers`, nameAr: 'خيار', price: 5, categoryId: null },
    { id: `${TEST_PREFIX}-prod-onions`, nameAr: 'بصل أحمر', price: 3, categoryId: null },
    { id: `${TEST_PREFIX}-prod-garlic`, nameAr: 'ثوم', price: 10, categoryId: null },
    { id: `${TEST_PREFIX}-prod-lemons`, nameAr: 'ليمون', price: 6, categoryId: null },
  ];

  // Store 3 products (3 items — closed store)
  const store3Products = [
    { id: `${TEST_PREFIX}-prod-kunafa`, nameAr: 'كنافة نابلسية', price: 30, categoryId: null },
    { id: `${TEST_PREFIX}-prod-baklava`, nameAr: 'بقلاوة', price: 25, categoryId: null },
    { id: `${TEST_PREFIX}-prod-maamoul`, nameAr: 'معمول', price: 20, categoryId: null },
  ];

  const allProducts = [
    ...store1Products.map(p => ({ ...p, storeId: store1Id })),
    ...store2Products.map(p => ({ ...p, storeId: store2Id })),
    ...store3Products.map(p => ({ ...p, storeId: store3Id })),
  ];

  for (const prod of allProducts) {
    await prisma.product.upsert({
      where: { id: prod.id },
      update: { price: prod.price, isAvailable: true },
      create: {
        id: prod.id,
        nameAr: prod.nameAr,
        price: prod.price,
        storeId: prod.storeId,
        categoryId: prod.categoryId,
        isAvailable: true,
      },
    });
  }

  console.log(`  ✅ ${allProducts.length} products upserted across 3 stores\n`);

  return { store1CategoryIds: [cat1, cat2, cat3], products: allProducts };
}

// ─── Standalone Promotional Offers ──────────────────────────────────────────

async function seedOffers(store1Id: string, store2Id: string): Promise<void> {
  console.log('🏷️  Seeding standalone promotional offers…');

  const offers = [
    {
      id: `${TEST_PREFIX}-offer-grill-special`,
      storeId: store1Id,
      titleAr: 'عرض المشاوي الخاصة',
      titleEn: 'Special Grill Offer',
      descriptionAr: 'مشكل مشاوي مع حمص ومشروب — سعر خاص',
      descriptionEn: 'Mixed grill with hummus and drink — special price',
      price: 55,
    },
    {
      id: `${TEST_PREFIX}-offer-family-meal`,
      storeId: store1Id,
      titleAr: 'وجبة عائلية',
      titleEn: 'Family Meal',
      descriptionAr: '4 شاورما + 2 حمص + 4 مشروبات',
      descriptionEn: '4 shawarmas + 2 hummus + 4 drinks',
      price: 85,
    },
    {
      id: `${TEST_PREFIX}-offer-grocery-bundle`,
      storeId: store2Id,
      titleAr: 'حقيبة الأساسيات',
      titleEn: 'Essentials Bundle',
      descriptionAr: 'أرز + زيت + سكر + دقيق — باقة وفر',
      descriptionEn: 'Rice + oil + sugar + flour — save bundle',
      price: 55,
    },
  ];

  for (const offer of offers) {
    await prisma.offer.upsert({
      where: { id: offer.id },
      update: { price: offer.price },
      create: { ...offer, isActive: true, sortOrder: 1 },
    });
  }

  console.log('  ✅ 3 standalone promotional offers created\n');
}

// ─── Orders Across All Lifecycle States ─────────────────────────────────────

interface OrderSpec {
  id: string;
  orderNumber: string;
  customerId: string;
  storeId: string;
  captainId: string | null;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  customerAddressText: string;
  deliveryFee: number;
  subtotal: number;
  totalAmount: number;
  voiceNoteUrl?: string;
  voiceNoteDuration?: number;
  isOfferOrder?: boolean;
}

async function seedOrders(
  store1: ResolvedStore,
  store2: ResolvedStore,
  captainA: ResolvedUser,
  customer1: ResolvedUser,
  customer2: ResolvedUser,
  customer3: ResolvedUser,
  ctx: { store1Id: string; store2Id: string },
  products: { id: string; storeId: string; price: number }[],
): Promise<void> {
  console.log('📋 Seeding orders across all lifecycle states…');

  const now = new Date();
  const orderDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const orders: OrderSpec[] = [
    // Order 1: PENDING + DELIVERY + voice note
    {
      id: `${TEST_PREFIX}-order-1`,
      orderNumber: formatOrderNumber(orderDate, 1),
      customerId: customer1.id,
      storeId: ctx.store1Id,
      captainId: null,
      status: 'PENDING',
      fulfillmentType: 'DELIVERY',
      customerAddressText: 'شارع الشهداء، بجانب مسجد الصلاح',
      deliveryFee: 10,
      subtotal: 45,
      totalAmount: 55,
      voiceNoteUrl: 'https://example.com/voice-notes/order1.webm',
      voiceNoteDuration: 15,
    },
    // Order 2: ACCEPTED (store accepted, waiting for captain)
    {
      id: `${TEST_PREFIX}-order-2`,
      orderNumber: formatOrderNumber(orderDate, 2),
      customerId: customer2.id,
      storeId: ctx.store1Id,
      captainId: null,
      status: 'ACCEPTED',
      fulfillmentType: 'DELIVERY',
      customerAddressText: 'حي الزيتون، شارع فلسطين',
      deliveryFee: 12,
      subtotal: 35,
      totalAmount: 47,
    },
    // Order 3: READY_FOR_PICKUP (PICKUP fulfillment)
    {
      id: `${TEST_PREFIX}-order-3`,
      orderNumber: formatOrderNumber(orderDate, 3),
      customerId: customer1.id,
      storeId: ctx.store2Id,
      captainId: null,
      status: 'READY_FOR_PICKUP',
      fulfillmentType: 'PICKUP',
      customerAddressText: 'استلام من المتجر',
      deliveryFee: 0,
      subtotal: 52,
      totalAmount: 52,
    },
    // Order 4: DELIVERED (complete with ledger entries)
    {
      id: `${TEST_PREFIX}-order-4`,
      orderNumber: formatOrderNumber(orderDate, 4),
      customerId: customer3.id,
      storeId: ctx.store1Id,
      captainId: captainA?.id ?? null,
      status: 'DELIVERED',
      fulfillmentType: 'DELIVERY',
      customerAddressText: 'شارع أمير، الطابق الثالث',
      deliveryFee: 10,
      subtotal: 80,
      totalAmount: 90,
    },
    // Order 5: PENDING with a standalone promotional offer item
    {
      id: `${TEST_PREFIX}-order-5`,
      orderNumber: formatOrderNumber(orderDate, 5),
      customerId: customer3.id,
      storeId: ctx.store1Id,
      captainId: null,
      status: 'PENDING',
      fulfillmentType: 'DELIVERY',
      customerAddressText: 'شارع النصر، بجانب الصيدلية',
      deliveryFee: 10,
      subtotal: 140,
      totalAmount: 150,
      isOfferOrder: true,
    },
    // Order 6: CANCELLED
    {
      id: `${TEST_PREFIX}-order-6`,
      orderNumber: formatOrderNumber(orderDate, 6),
      customerId: customer2.id,
      storeId: ctx.store2Id,
      captainId: null,
      status: 'CANCELLED',
      fulfillmentType: 'DELIVERY',
      customerAddressText: 'شارع الحجاز، بجانب السوق المركزي',
      deliveryFee: 12,
      subtotal: 25,
      totalAmount: 37,
    },
  ];

  for (const order of orders) {
    const { isOfferOrder, ...orderData } = order;

    await prisma.order.upsert({
      where: { id: orderData.id },
      update: { status: orderData.status },
      create: { ...orderData, paymentMethod: 'COD' },
    });

    // Create order items
    if (orderData.storeId === ctx.store1Id) {
      if (isOfferOrder) {
        const regularProduct = products.find(p => p.storeId === ctx.store1Id && p.id === `${TEST_PREFIX}-prod-mixed-grill`);
        const fallbackProduct = products.find(p => p.storeId === ctx.store1Id);

        if (regularProduct) {
          await prisma.orderItem.upsert({
            where: { id: `${orderData.id}-item-regular` },
            update: {},
            create: {
              id: `${orderData.id}-item-regular`,
              orderId: orderData.id,
              productId: regularProduct.id,
              quantity: 1,
              unitPrice: regularProduct.price,
              totalPrice: regularProduct.price,
              isOfferItem: false,
            },
          });
        }
        if (fallbackProduct) {
          await prisma.orderItem.upsert({
            where: { id: `${orderData.id}-item-offer1` },
            update: {},
            create: {
              id: `${orderData.id}-item-offer1`,
              orderId: orderData.id,
              productId: fallbackProduct.id,
              quantity: 2,
              unitPrice: 55,
              totalPrice: 110,
              isOfferItem: true,
              offerTitle: 'عرض المشاوي الخاصة',
              offerId: `${TEST_PREFIX}-offer-grill-special`,
            },
          });
        }
      } else {
        const product = products.find(p => p.storeId === ctx.store1Id && p.id === `${TEST_PREFIX}-prod-shawarma`);
        if (product) {
          await prisma.orderItem.upsert({
            where: { id: `${orderData.id}-item-1` },
            update: {},
            create: {
              id: `${orderData.id}-item-1`,
              orderId: orderData.id,
              productId: product.id,
              quantity: 2,
              unitPrice: product.price,
              totalPrice: product.price * 2,
              isOfferItem: false,
            },
          });
        }
      }
    } else {
      const product = products.find(p => p.storeId === ctx.store2Id && p.id === `${TEST_PREFIX}-prod-rice`);
      if (product) {
        await prisma.orderItem.upsert({
          where: { id: `${orderData.id}-item-1` },
          update: {},
          create: {
            id: `${orderData.id}-item-1`,
            orderId: orderData.id,
            productId: product.id,
            quantity: 3,
            unitPrice: product.price,
            totalPrice: product.price * 3,
            isOfferItem: false,
          },
        });
      }
    }
  }

  // Update daily sequence
  await prisma.dailyOrderSequence.upsert({
    where: { date: orderDate },
    update: { sequence: 6 },
    create: { date: orderDate, sequence: 6 },
  });

  console.log('  ✅ 6 orders upserted across all lifecycle states\n');
}

// ─── Wallets & Ledger Entries ───────────────────────────────────────────────

async function seedWallets(store1: ResolvedStore, captainA: ResolvedUser): Promise<void> {
  console.log('💰 Seeding wallets & ledger entries…');

  const storeWallet = await prisma.wallet.upsert({
    where: { storeId: store1.id },
    update: { balance: 150 },
    create: { storeId: store1.id, balance: 150, commissionRate: 0.10 },
  });

  const captainWallet = await prisma.wallet.upsert({
    where: { userId: captainA.id },
    update: { balance: 85 },
    create: { userId: captainA.id, balance: 85 },
  });

  const storeEntries: Array<{ type: 'EARNING' | 'COMMISSION' | 'SETTLEMENT'; amount: number; description: string }> = [
    { type: 'EARNING', amount: 100, description: 'أرباح المتجر عن الطلب SQ-0001 / Store earnings for order SQ-0001' },
    { type: 'COMMISSION', amount: -10, description: 'عمولة المنصة عن الطلب SQ-0001 / Platform commission for order SQ-0001' },
    { type: 'EARNING', amount: 80, description: 'أرباح المتجر عن الطلب SQ-0002 / Store earnings for order SQ-0002' },
    { type: 'COMMISSION', amount: -8, description: 'عمولة المنصة عن الطلب SQ-0002 / Platform commission for order SQ-0002' },
    { type: 'SETTLEMENT', amount: -12, description: 'تسوية مالية / Financial settlement' },
  ];

  const captainEntries: Array<{ type: 'EARNING' | 'COMMISSION' | 'SETTLEMENT'; amount: number; description: string }> = [
    { type: 'EARNING', amount: 12, description: 'أرباح التوصيل عن الطلب SQ-0001 / Delivery earnings for order SQ-0001' },
    { type: 'EARNING', amount: 15, description: 'أرباح التوصيل عن الطلب SQ-0002 / Delivery earnings for order SQ-0002' },
    { type: 'EARNING', amount: 10, description: 'أرباح التوصيل عن الطلب SQ-0003 / Delivery earnings for order SQ-0003' },
  ];

  for (const [index, entry] of storeEntries.entries()) {
    await prisma.ledgerEntry.upsert({
      where: { id: `${TEST_PREFIX}-ledger-store-${index + 1}` },
      update: { amount: entry.amount },
      create: { id: `${TEST_PREFIX}-ledger-store-${index + 1}`, walletId: storeWallet.id, type: entry.type, amount: entry.amount, description: entry.description },
    });
  }

  for (const [index, entry] of captainEntries.entries()) {
    await prisma.ledgerEntry.upsert({
      where: { id: `${TEST_PREFIX}-ledger-captain-${index + 1}` },
      update: { amount: entry.amount },
      create: { id: `${TEST_PREFIX}-ledger-captain-${index + 1}`, walletId: captainWallet.id, type: entry.type, amount: entry.amount, description: entry.description },
    });
  }

  console.log('  ✅ 2 wallets upserted (8 ledger entries, deterministic ids)\n');
}

// ─── Ratings ────────────────────────────────────────────────────────────────

async function seedRatings(customer3: ResolvedUser, store1: ResolvedStore, captainA: ResolvedUser): Promise<void> {
  console.log('⭐ Seeding ratings…');

  await prisma.rating.upsert({
    where: { orderId: `${TEST_PREFIX}-order-4` },
    update: {},
    create: {
      orderId: `${TEST_PREFIX}-order-4`,
      customerId: customer3.id,
      storeId: store1.id,
      captainId: captainA?.id ?? null,
      storeRating: 5,
      captainRating: 4,
      comment: 'تم التوصيل بسرعة، الطعام ممتاز! / Fast delivery, excellent food!',
    },
  });

  console.log('  ✅ 1 rating created\n');
}

// ─── Favorites ──────────────────────────────────────────────────────────────

interface FavoriteSpec {
  id: string;
  userId: string;
  storeId: string;
}

async function addFavoriteForCustomer(spec: FavoriteSpec): Promise<void> {
  const existing = await prisma.favorite.findFirst({ where: { userId: spec.userId, storeId: spec.storeId } });
  if (existing) return;
  try {
    await prisma.favorite.create({ data: spec });
  } catch {
    // P2002 race — another run already inserted it; safe to ignore.
  }
}

async function seedFavorites(customer1: ResolvedUser, customer3: ResolvedUser, store1: ResolvedStore, store2: ResolvedStore): Promise<void> {
  console.log('❤️  Seeding favorites…');

  await addFavoriteForCustomer({ id: `${TEST_PREFIX}-fav-1`, userId: customer1.id, storeId: store1.id });
  await addFavoriteForCustomer({ id: `${TEST_PREFIX}-fav-2`, userId: customer3.id, storeId: store1.id });
  await addFavoriteForCustomer({ id: `${TEST_PREFIX}-fav-3`, userId: customer3.id, storeId: store2.id });

  console.log('  ✅ 3 favorites find-or-created\n');
}

// ─── Post-Seed Verification ─────────────────────────────────────────────────

async function verifySeededData(users: { admin: ResolvedUser; captainA: ResolvedUser; customer4: ResolvedUser }): Promise<void> {
  console.log('━'.repeat(60));
  console.log('🧪 POST-SEED VERIFICATION');

  // 1. As-Samou stores
  const asSamouStores = await prisma.store.findMany({
    where: { nameAr: { in: AS_SAMOU_STORE_NAMES } },
    select: { nameAr: true, storeStatus: true },
    orderBy: { createdAt: 'asc' },
  });

  // 2. Totals
  const totals = {
    stores: await prisma.store.count(),
    users: await prisma.user.count(),
    products: await prisma.product.count(),
    orders: await prisma.order.count(),
  };

  console.log('\n🏪 As-Samou stores found:');
  for (const name of AS_SAMOU_STORE_NAMES) {
    const hit = asSamouStores.find((s: { nameAr: string; storeStatus: string }) => s.nameAr === name);
    console.log(`  ${hit ? '✅' : '❌'} ${name} — ${hit ? hit.storeStatus : 'MISSING'}`);
  }

  console.log('\n📊 Live totals (preserved + seeded):');
  console.log(`  • Total stores   : ${totals.stores}`);
  console.log(`  • Total users    : ${totals.users}`);
  console.log(`  • Total products : ${totals.products}`);
  console.log(`  • Total orders   : ${totals.orders}`);
  console.log('    (totals above include any previously-existing custom data — nothing was wiped)');

  // 3. Login readiness
  console.log('\n🔑 Login accounts (phone + password for immediate testing):');
  const verifiedLogins: Array<{ phone: string; password: string | null; state: string; role: string }> = [
    { phone: users.admin.phone, password: users.admin.password, state: users.admin.state, role: 'ADMIN' },
    { phone: users.customer4.phone, password: users.customer4.password, state: users.customer4.state, role: 'CUSTOMER' },
    { phone: users.captainA.phone, password: users.captainA.password, state: users.captainA.state, role: 'CAPTAIN' },
  ];

  for (const login of verifiedLogins) {
    const record = await prisma.user.findUnique({ where: { phone: login.phone } });
    if (!record) {
      console.log(`  ❌ ${login.phone} — NOT FOUND in database`);
      continue;
    }
    const stateTag =
      login.state === 'kept' ? 'existing account — password left untouched'
      : login.state === 'updated' ? 'refreshed (this script owns it)'
      : 'created fresh';
    const passwordPart =
      login.password ? `Password: ${login.password}` : 'Password: <untouched, unknown>';
    console.log(`  • phone  ${login.phone}  (${login.role}, active=${record.isActive})  [${stateTag}]`);
    console.log(`    ${passwordPart}`);

    if (login.password) {
      const matches = await verifyPassword(login.password, record.passwordHash);
      if (!matches) {
        console.error(`    ✖ bcrypt check FAILED for ${login.phone} — password/hash mismatch!`);
        process.exitCode = 1;
      } else {
        console.log(`    ✔ bcrypt verified against stored hash (ready to log in)`);
      }
    }
  }

  if (process.exitCode === 1) {
    throw new Error('Post-seed verification failed: a login password does not match its stored hash.');
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🧪 Samou Quick — As-Samou E2E Test Data Seed (NON-DESTRUCTIVE)');
  console.log(`   Time: ${new Date().toISOString()}\n`);
  console.log('━'.repeat(60));

  await resolvePrismaClient();
  printTarget();

  await seedPlatformSettings();
  await seedDeliveryZones();

  const users = await seedUsers();
  const stores = await seedStores(users.manager1.id, users.manager2.id, users.manager3.id);
  const { products } = await seedCatalog(stores.store1.id, stores.store2.id, stores.store3.id);
  await seedOffers(stores.store1.id, stores.store2.id);

  await seedOrders(
    stores.store1,
    stores.store2,
    users.captainA,
    users.customer1,
    users.customer2,
    users.customer3,
    { store1Id: stores.store1.id, store2Id: stores.store2.id },
    products,
  );

  await seedWallets(stores.store1, users.captainA);
  await seedRatings(users.customer3, stores.store1, users.captainA);
  await seedFavorites(users.customer1, users.customer3, stores.store1, stores.store2);

  await verifySeededData(users);

  console.log('\n' + '━'.repeat(60));
  console.log('✅ As-Samou E2E data seeded successfully (non-destructive).');
  console.log('━'.repeat(60) + '\n');
}

main()
  .catch(error => {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await prisma.$disconnect();
  });
