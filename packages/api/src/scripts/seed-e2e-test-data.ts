#!/usr/bin/env tsx
/**
 * E2E Test Data Seed — `npm run seed:e2e`
 *
 * Populates the database with realistic Arabic-localized test data for
 * stress-testing, API validation, and edge-case verification. Uses the three
 * local As-Samou stores plus verified captains, test customers, and every
 * order lifecycle stage.
 *
 * Idempotent: cleans existing test data before re-inserting.
 * Safe: uses fixed IDs to avoid conflicts with production data.
 *
 * Usage:
 *   cd packages/api && npm run seed:e2e
 */

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

import { hashPassword } from '../lib/password';
import { generateStoreSlug, generateCustomerCode, generateCaptainCode } from '@samou-go/shared-types';
import { createHash } from 'node:crypto';

import { PrismaClient } from '../../generated/prisma-sqlite';
import type { PrismaClient as SqlitePrismaClient } from '../../generated/prisma-sqlite';

const PrismaClientCtor = PrismaClient as unknown as typeof SqlitePrismaClient;
const prisma: SqlitePrismaClient = new PrismaClientCtor();

// ─── Constants ──────────────────────────────────────────────────────────────

const TEST_PREFIX = 'e2e-test'; // prefix for all test data IDs
const DEFAULT_PASSWORD = 'Password123!';

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

// ─── Cleanup ────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  console.log('🧹 Cleaning existing test data…');

  // Delete in reverse dependency order
  await prisma.ledgerEntry.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.customRequest.deleteMany();
  await prisma.offerProduct.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.store.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.dailyOrderSequence.deleteMany();
  await prisma.deliveryZone.deleteMany();

  console.log('✅ Cleanup complete\n');
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
      update: { fee: zone.fee },
      create: {
        id: zone.id,
        nameAr: zone.nameAr,
        nameEn: zone.nameEn,
        fee: zone.fee,
        sortOrder: zone.sortOrder,
        isActive: true,
      },
    });
  }

  console.log('  ✅ 3 delivery zones created\n');
}

// ─── Users ──────────────────────────────────────────────────────────────────

async function seedUsers(): Promise<{
  adminId: string;
  manager1Id: string;
  manager2Id: string;
  captainAId: string;
  captainBId: string;
  captainCId: string;
  customer1Id: string;
  customer2Id: string;
  customer3Id: string;
}> {
  console.log('👤 Seeding users…');

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  const adminId = `${TEST_PREFIX}-user-admin`;
  const manager1Id = `${TEST_PREFIX}-user-manager1`;
  const manager2Id = `${TEST_PREFIX}-user-manager2`;
  const captainAId = `${TEST_PREFIX}-user-captain-a`;
  const captainBId = `${TEST_PREFIX}-user-captain-b`;
  const captainCId = `${TEST_PREFIX}-user-captain-c`;
  const customer1Id = `${TEST_PREFIX}-user-customer1`;
  const customer2Id = `${TEST_PREFIX}-user-customer2`;
  const customer3Id = `${TEST_PREFIX}-user-customer3`;

  const users = [
    {
      id: adminId, name: 'مدير النظام (E2E)', phone: '0599000001', role: 'ADMIN' as const,
      isActive: true, isVerified: true, isAvailable: false,
    },
    {
      id: manager1Id, name: 'مدير المتجر الأول (E2E)', phone: '0599000002', role: 'STORE_MANAGER' as const,
      isActive: true, isVerified: true, isAvailable: false,
    },
    {
      id: manager2Id, name: 'مدير المتجر الثاني (E2E)', phone: '0599000003', role: 'STORE_MANAGER' as const,
      isActive: true, isVerified: true, isAvailable: false,
    },
    {
      id: captainAId, name: 'كابتن أحمد (E2E)', phone: '0599000004', role: 'CAPTAIN' as const,
      isActive: true, isVerified: true, isAvailable: true,
    },
    {
      id: captainBId, name: 'كابتن سعيد (E2E)', phone: '0599000005', role: 'CAPTAIN' as const,
      isActive: true, isVerified: false, isAvailable: false,
    },
    {
      id: captainCId, name: 'كابتن خالد (E2E)', phone: '0599000006', role: 'CAPTAIN' as const,
      isActive: false, isVerified: true, isAvailable: false,
    },
    {
      id: customer1Id, name: 'عميل فاطمة (E2E)', phone: '0599000007', role: 'CUSTOMER' as const,
      isActive: true, isVerified: true, isAvailable: false,
      userCode: generateCustomerCode(deterministicSeed('0599000007')),
    },
    {
      id: customer2Id, name: 'عميل جديد (E2E)', phone: '0599000008', role: 'CUSTOMER' as const,
      isActive: true, isVerified: true, isAvailable: false,
      userCode: generateCustomerCode(deterministicSeed('0599000008')),
    },
    {
      id: customer3Id, name: 'عميل متكرر (E2E)', phone: '0599000009', role: 'CUSTOMER' as const,
      isActive: true, isVerified: true, isAvailable: false,
      userCode: generateCustomerCode(deterministicSeed('0599000009')),
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        phone: user.phone,
        passwordHash,
        role: user.role,
        isActive: user.isActive,
        isVerified: user.isVerified,
        isAvailable: user.isAvailable,
      },
      create: {
        ...user,
        passwordHash,
      },
    });
  }

  console.log('  ✅ 9 users created (1 admin, 2 managers, 3 captains, 3 customers)\n');

  return { adminId, manager1Id, manager2Id, captainAId, captainBId, captainCId, customer1Id, customer2Id, customer3Id };
}

// ─── Stores ─────────────────────────────────────────────────────────────────

async function seedStores(manager1Id: string, manager2Id: string): Promise<{
  store1Id: string;
  store2Id: string;
  store3Id: string;
}> {
  console.log('🏪 Seeding stores…');

  const store1Id = `${TEST_PREFIX}-store-restaurant`;
  const store2Id = `${TEST_PREFIX}-store-supermarket`;
  const store3Id = `${TEST_PREFIX}-store-sweets`;

  const stores = [
    {
      id: store1Id, managerId: manager1Id,
      nameAr: 'مطعم ومشويات القدس', nameEn: 'Al-Quds Restaurant & Grill',
      phone: '0599100001', storeType: 'RESTAURANT' as const,
      storeStatus: 'OPEN' as const,
      slug: generateStoreSlug('مطعم ومشويات القدس'),
    },
    {
      id: store2Id, managerId: manager2Id,
      nameAr: 'سوبرماركت البركة', nameEn: 'Al-Baraka Supermarket',
      phone: '0599100002', storeType: 'SUPERMARKET' as const,
      storeStatus: 'OPEN' as const,
      slug: generateStoreSlug('سوبرماركت البركة'),
    },
    {
      id: store3Id, managerId: manager1Id,
      nameAr: 'حلويات البلدة القديمة', nameEn: 'Old City Sweets',
      phone: '0599100003', storeType: 'BAKERY_SWEETS' as const,
      storeStatus: 'CLOSED' as const,
      slug: generateStoreSlug('حلويات البلدة القديمة'),
    },
  ];

  for (const store of stores) {
    await prisma.store.upsert({
      where: { id: store.id },
      update: {
        storeStatus: store.storeStatus,
        storeType: store.storeType,
      },
      create: {
        ...store,
        isActive: true,
        isApproved: true,
        isAcceptingOrders: store.storeStatus === 'OPEN',
      },
    });
  }

  console.log('  ✅ 3 stores created (Restaurant, Supermarket, Sweets)\n');

  console.log('🏪 LOCAL AS-SAMOU STORES:');
  console.log('  • مطعم ومشويات القدس — RESTAURANT (OPEN)');
  console.log('  • سوبرماركت البركة — SUPERMARKET (OPEN)');
  console.log('  • حلويات البلدة القديمة — BAKERY_SWEETS (CLOSED)\n');

  return { store1Id, store2Id, store3Id };
}

// ─── Categories & Products ──────────────────────────────────────────────────

async function seedCatalog(store1Id: string, store2Id: string, store3Id: string): Promise<{
  products: { id: string; storeId: string; nameAr: string; price: number }[];
}> {
  console.log('📦 Seeding categories & products…');

  // Store 1: Restaurant categories
  const cat1 = `${TEST_PREFIX}-cat-appetizers`;
  const cat2 = `${TEST_PREFIX}-cat-grills`;
  const cat3 = `${TEST_PREFIX}-cat-drinks`;

  await prisma.category.upsert({
    where: { id: cat1 },
    update: {},
    create: { id: cat1, nameAr: 'مقبلات', nameEn: 'Appetizers', storeId: store1Id, sortOrder: 1 },
  });
  await prisma.category.upsert({
    where: { id: cat2 },
    update: {},
    create: { id: cat2, nameAr: 'مشاوي', nameEn: 'Grills', storeId: store1Id, sortOrder: 2 },
  });
  await prisma.category.upsert({
    where: { id: cat3 },
    update: {},
    create: { id: cat3, nameAr: 'مشروبات', nameEn: 'Drinks', storeId: store1Id, sortOrder: 3 },
  });

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
      update: { price: prod.price },
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

  console.log(`  ✅ ${allProducts.length} products created across 3 stores\n`);

  return { products: allProducts };
}

// ─── Standalone Promotional Offers ──────────────────────────────────────────

async function seedOffers(store1Id: string, store2Id: string): Promise<{
  offers: { id: string; storeId: string; titleAr: string; price: number }[];
}> {
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
      create: {
        ...offer,
        isActive: true,
        sortOrder: 1,
      },
    });
  }

  console.log('  ✅ 3 standalone promotional offers created\n');

  return { offers };
}

// ─── Orders Across All Lifecycle States ─────────────────────────────────────

async function seedOrders(
  customer1Id: string,
  customer2Id: string,
  customer3Id: string,
  store1Id: string,
  store2Id: string,
  captainAId: string,
  products: { id: string; storeId: string; price: number }[],
  offers: { id: string; storeId: string; price: number }[],
): Promise<void> {
  console.log('📋 Seeding orders across all lifecycle states…');

  const now = new Date();
  const orderDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const orders = [
    // Order 1: PENDING + DELIVERY + voice note
    {
      id: `${TEST_PREFIX}-order-1`,
      orderNumber: formatOrderNumber(orderDate, 1),
      customerId: customer1Id,
      storeId: store1Id,
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
      customerId: customer2Id,
      storeId: store1Id,
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
      customerId: customer1Id,
      storeId: store2Id,
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
      customerId: customer3Id,
      storeId: store1Id,
      captainId: captainAId,
      status: 'DELIVERED',
      fulfillmentType: 'DELIVERY',
      customerAddressText: 'شارع أمير، الطابق الثالث',
      deliveryFee: 10,
      subtotal: 80,
      totalAmount: 90,
    },
    // Order 5: PENDING with standalone promotional offers (isOfferItem)
    {
      id: `${TEST_PREFIX}-order-5`,
      orderNumber: formatOrderNumber(orderDate, 5),
      customerId: customer3Id,
      storeId: store1Id,
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
      customerId: customer2Id,
      storeId: store2Id,
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
    const { isOfferOrder, ...orderData } = order as any;

    await prisma.order.upsert({
      where: { id: orderData.id },
      update: { status: orderData.status },
      create: {
        ...orderData,
        paymentMethod: 'COD',
      },
    });

    // Create order items
    if (orderData.storeId === store1Id) {
      if (isOfferOrder) {
        // Order 5: mixed regular items + standalone offers
        const regularProduct = products.find(p => p.storeId === store1Id && p.id === `${TEST_PREFIX}-prod-mixed-grill`);
        const offer1 = offers.find(o => o.id === `${TEST_PREFIX}-offer-grill-special`);

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
        if (offer1) {
          // For offer items, we need a valid productId — use the first store product
          const fallbackProduct = products.find(p => p.storeId === store1Id)!;
          await prisma.orderItem.upsert({
            where: { id: `${orderData.id}-item-offer1` },
            update: {},
            create: {
              id: `${orderData.id}-item-offer1`,
              orderId: orderData.id,
              productId: fallbackProduct.id,
              quantity: 2,
              unitPrice: offer1.price,
              totalPrice: offer1.price * 2,
              isOfferItem: true,
              offerTitle: 'عرض المشاوي الخاصة',
              offerId: offer1.id,
            },
          });
        }
      } else {
        // Regular items for orders 1, 2, 4
        const product = products.find(p => p.storeId === store1Id && p.id === `${TEST_PREFIX}-prod-shawarma`);
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
      // Store 2 items
      const product = products.find(p => p.storeId === store2Id && p.id === `${TEST_PREFIX}-prod-rice`);
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

  console.log('  ✅ 6 orders created across all lifecycle states\n');
}

// ─── Wallets & Ledger Entries ───────────────────────────────────────────────

async function seedWallets(
  store1Id: string,
  captainAId: string,
): Promise<void> {
  console.log('💰 Seeding wallets & ledger entries…');

  // Store 1 wallet
  const storeWallet = await prisma.wallet.upsert({
    where: { storeId: store1Id },
    update: { balance: 150 },
    create: {
      storeId: store1Id,
      balance: 150,
      commissionRate: 0.10,
    },
  });

  // Captain A wallet
  const captainWallet = await prisma.wallet.upsert({
    where: { userId: captainAId },
    update: { balance: 85 },
    create: {
      userId: captainAId,
      balance: 85,
    },
  });

  // Ledger entries for store 1
  const storeEntries = [
    { type: 'EARNING', amount: 100, description: 'أرباح المتجر عن الطلب SQ-0001 / Store earnings for order SQ-0001' },
    { type: 'COMMISSION', amount: -10, description: 'عمولة المنصة عن الطلب SQ-0001 / Platform commission for order SQ-0001' },
    { type: 'EARNING', amount: 80, description: 'أرباح المتجر عن الطلب SQ-0002 / Store earnings for order SQ-0002' },
    { type: 'COMMISSION', amount: -8, description: 'عمولة المنصة عن الطلب SQ-0002 / Platform commission for order SQ-0002' },
    { type: 'SETTLEMENT', amount: -12, description: 'تسوية مالية / Financial settlement' },
  ];

  for (const entry of storeEntries) {
    await prisma.ledgerEntry.create({
      data: {
        walletId: storeWallet.id,
        type: entry.type as any,
        amount: entry.amount,
        description: entry.description,
      },
    });
  }

  // Ledger entries for captain A
  const captainEntries = [
    { type: 'EARNING', amount: 12, description: 'أرباح التوصيل عن الطلب SQ-0001 / Delivery earnings for order SQ-0001' },
    { type: 'EARNING', amount: 15, description: 'أرباح التوصيل عن الطلب SQ-0002 / Delivery earnings for order SQ-0002' },
    { type: 'EARNING', amount: 10, description: 'أرباح التوصيل عن الطلب SQ-0003 / Delivery earnings for order SQ-0003' },
  ];

  for (const entry of captainEntries) {
    await prisma.ledgerEntry.create({
      data: {
        walletId: captainWallet.id,
        type: entry.type as any,
        amount: entry.amount,
        description: entry.description,
      },
    });
  }

  console.log('  ✅ 2 wallets created with ledger entries\n');
}

// ─── Ratings ────────────────────────────────────────────────────────────────

async function seedRatings(customer1Id: string, customer3Id: string, store1Id: string, captainAId: string): Promise<void> {
  console.log('⭐ Seeding ratings…');

  await prisma.rating.upsert({
    where: { orderId: `${TEST_PREFIX}-order-4` },
    update: {},
    create: {
      orderId: `${TEST_PREFIX}-order-4`,
      customerId: customer3Id,
      storeId: store1Id,
      captainId: captainAId,
      storeRating: 5,
      captainRating: 4,
      comment: 'تم التوصيل بسرعة، الطعام ممتاز! / Fast delivery, excellent food!',
    },
  });

  console.log('  ✅ 1 rating created\n');
}

// ─── Favorites ──────────────────────────────────────────────────────────────

async function seedFavorites(customer1Id: string, customer3Id: string, store1Id: string, store2Id: string): Promise<void> {
  console.log('❤️  Seeding favorites…');

  await prisma.favorite.upsert({
    where: { id: `${TEST_PREFIX}-fav-1` },
    update: {},
    create: { id: `${TEST_PREFIX}-fav-1`, userId: customer1Id, storeId: store1Id },
  });

  await prisma.favorite.upsert({
    where: { id: `${TEST_PREFIX}-fav-2` },
    update: {},
    create: { id: `${TEST_PREFIX}-fav-2`, userId: customer3Id, storeId: store1Id },
  });

  await prisma.favorite.upsert({
    where: { id: `${TEST_PREFIX}-fav-3` },
    update: {},
    create: { id: `${TEST_PREFIX}-fav-3`, userId: customer3Id, storeId: store2Id },
  });

  console.log('  ✅ 3 favorites created\n');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🧪 Samou Quick — E2E Test Data Seed');
  console.log(`   Time: ${new Date().toISOString()}\n`);
  console.log('━'.repeat(60));

  await cleanup();
  await seedPlatformSettings();
  await seedDeliveryZones();

  const users = await seedUsers();
  const stores = await seedStores(users.manager1Id, users.manager2Id);
  const { products } = await seedCatalog(stores.store1Id, stores.store2Id, stores.store3Id);
  const { offers } = await seedOffers(stores.store1Id, stores.store2Id);

  await seedOrders(
    users.customer1Id, users.customer2Id, users.customer3Id,
    stores.store1Id, stores.store2Id,
    users.captainAId,
    products, offers,
  );

  await seedWallets(stores.store1Id, users.captainAId);
  await seedRatings(users.customer1Id, users.customer3Id, stores.store1Id, users.captainAId);
  await seedFavorites(users.customer1Id, users.customer3Id, stores.store1Id, stores.store2Id);

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('━'.repeat(60));
  console.log('📊 SEED SUMMARY');
  console.log('━'.repeat(60));

  console.log('\n👤 Users (all passwords: Password123!):');
  console.log('  ┌─────────────────────┬──────────────┬──────────────────────┐');
  console.log('  │ Role                │ Phone        │ Email                │');
  console.log('  ├─────────────────────┼──────────────┼──────────────────────┤');
  console.log('  │ Admin               │ 0599000001   │ admin@samouquick.ps  │');
  console.log('  │ Store Manager 1     │ 0599000002   │ store1@samouquick.ps │');
  console.log('  │ Store Manager 2     │ 0599000003   │ store2@samouquick.ps │');
  console.log('  │ Captain A (Active)  │ 0599000004   │ —                    │');
  console.log('  │ Captain B (Pending) │ 0599000005   │ —                    │');
  console.log('  │ Captain C (Blocked) │ 0599000006   │ —                    │');
  console.log('  │ Customer 1 (Active) │ 0599000007   │ —                    │');
  console.log('  │ Customer 2 (New)    │ 0599000008   │ —                    │');
  console.log('  │ Customer 3 (Repeat) │ 0599000009   │ —                    │');
  console.log('  └─────────────────────┴──────────────┴──────────────────────┘');

  console.log('\n🏪 Stores:');
  console.log('  ┌──────────────────────────────┬────────────┬────────────┐');
  console.log('  │ Name                         │ Type       │ Status     │');
  console.log('  ├──────────────────────────────┼────────────┼────────────┤');
  console.log('  │ مطعم ومشويات القدس           │ RESTAURANT │ OPEN       │');
  console.log('  │ سوبرماركت البركة             │ SUPERMARKET│ OPEN       │');
  console.log('  │ حلويات البلدة القديمة        │ BAKERY     │ CLOSED     │');
  console.log('  └──────────────────────────────┴────────────┴────────────┘');

  console.log('\n📋 Orders by Status:');
  console.log('  • PENDING:          2 (Order 1, Order 5)');
  console.log('  • ACCEPTED:         1 (Order 2)');
  console.log('  • READY_FOR_PICKUP: 1 (Order 3 — PICKUP)');
  console.log('  • DELIVERED:        1 (Order 4 — with wallet ledger)');
  console.log('  • CANCELLED:        1 (Order 6)');

  console.log('\n🔗 Test URLs:');
  console.log('  • Admin Dashboard:    http://localhost:5176');
  console.log('  • Store Manager:      http://localhost:5174');
  console.log('  • Customer App:       http://localhost:5173');
  console.log('  • Captain App:        http://localhost:5175');

  console.log('\n💰 Wallet Balances:');
  console.log('  • Store 1 Wallet:  150 ₪ (5 ledger entries)');
  console.log('  • Captain A Wallet:  85 ₪ (3 ledger entries)');

  console.log('\n' + '━'.repeat(60));
  console.log('✅ E2E test data seeded successfully!');
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
