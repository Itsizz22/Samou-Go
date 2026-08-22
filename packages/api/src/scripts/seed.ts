/**
 * Development seed — `npm run db:seed`
 *
 * Idempotent: every row carries an explicit deterministic id, so re-running
 * updates in place instead of piling up duplicates. Safe to run after every
 * `npm run db:push` (Neon PostgreSQL sync).
 *
 * Never run against production: the passwords below are public knowledge.
 */
import path from 'node:path';
import dotenv from 'dotenv';

// 1. تحميل .env الخاص بالمشروع فوراً مع تجاوز أي كاش قديم
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

import { OrderStatus, PaymentMethod } from '@samou-go/shared-types';
import { calculateOrderTotals, lineTotal } from '@samou-go/shared-types';
import { env } from '../config/env';
import { hashPassword } from '../lib/password';
import { formatOrderNumber, startOfDay } from '../lib/order-number';
import { creditDeliveredOrder } from '../modules/platform/platform.service';
import { DEMO_PASSWORD, DEMO_USERS } from './demo-users';

// 2. استخدام PrismaClient المباشر وقراءة DATABASE_URL من البيئة مباشرة
import { PrismaClient } from '../../generated/prisma-postgres';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

interface SeedProduct {
  id: string;
  nameAr: string;
  description: string;
  price: number;
  isAvailable?: boolean;
}

interface SeedCategory {
  id: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
  products: SeedProduct[];
}

interface SeedStore {
  id: string;
  nameAr: string;
  nameEn: string;
  phone: string;
  logoUrl: string | null;
  managerId: string;
  latitude: number;
  longitude: number;
  categories: SeedCategory[];
}

/**
 * Delivery zones — admin-configured regions with a flat fee. The captain
 * picks the zone per order; the fee is looked up from HERE, never typed by
 * the captain ("client never sends money").
 */
interface SeedZone {
  id: string;
  nameAr: string;
  nameEn: string;
  fee: number;
  sortOrder: number;
}

const DELIVERY_ZONES: SeedZone[] = [
  { id: 'zone-hebron-center', nameAr: 'وسط الخليل', nameEn: 'Hebron Center', fee: 5, sortOrder: 1 },
  { id: 'zone-hebron-north', nameAr: 'شمال الخليل', nameEn: 'Hebron North', fee: 8, sortOrder: 2 },
  { id: 'zone-hebron-south', nameAr: 'جنوب الخليل', nameEn: 'Hebron South', fee: 8, sortOrder: 3 },
  { id: 'zone-hebron-remote', nameAr: 'الأطراف البعيدة', nameEn: 'Remote Areas', fee: 12, sortOrder: 4 },
];

const STORES: SeedStore[] = [
  {
    id: 'store-albaraka',
    nameAr: 'سوبرماركت البركة',
    nameEn: 'Al Baraka Supermarket',
    phone: '0599100201',
    logoUrl: null,
    managerId: 'user-manager-baraka',
    latitude: 31.3971,
    longitude: 35.0716,
    categories: [
      {
        id: 'cat-baraka-dairy',
        nameAr: 'ألبان وأجبان',
        nameEn: 'Dairy',
        sortOrder: 1,
        products: [
          { id: 'p-baraka-milk', nameAr: 'حليب طازج 1 لتر', description: 'حليب بقري طازج مبستر.', price: 6.5 },
          { id: 'p-baraka-labneh', nameAr: 'لبنة بلدية 500 غ', description: 'لبنة بلدية من حليب الأغنام.', price: 14 },
          { id: 'p-baraka-yogurt', nameAr: 'لبن رايب 1 كغ', description: 'لبن رايب طبيعي.', price: 8 },
        ],
      },
      {
        id: 'cat-baraka-bakery',
        nameAr: 'مخبوزات',
        nameEn: 'Bakery',
        sortOrder: 2,
        products: [
          { id: 'p-baraka-khobz', nameAr: 'خبز كمّاج (٦ أرغفة)', description: 'خبز طازج يومياً.', price: 4 },
          { id: 'p-baraka-kaak', nameAr: 'كعك بالسمسم', description: 'كعك مخبوز على الطريقة البلدية.', price: 5 },
        ],
      },
      {
        id: 'cat-baraka-pantry',
        nameAr: 'مواد أساسية',
        nameEn: 'Pantry',
        sortOrder: 3,
        products: [
          { id: 'p-baraka-rice', nameAr: 'أرز بسمتي 1 كغ', description: 'أرز بسمتي طويل الحبة.', price: 12 },
          { id: 'p-baraka-oil', nameAr: 'زيت زيتون 750 مل', description: 'زيت زيتون بلدي عصرة أولى.', price: 45 },
          { id: 'p-baraka-sugar', nameAr: 'سكر 2 كغ', description: 'سكر أبيض ناعم.', price: 9.5 },
          { id: 'p-baraka-tea', nameAr: 'شاي أكياس (١٠٠ كيس)', description: 'شاي أسود.', price: 15, isAvailable: false },
        ],
      },
    ],
  },
  {
    id: 'store-shawarma',
    nameAr: 'مطعم أبو صالح للشاورما',
    nameEn: 'Abu Saleh Shawarma',
    phone: '0567100302',
    logoUrl: null,
    managerId: 'user-manager-shawarma',
    latitude: 31.3984,
    longitude: 35.0702,
    categories: [
      {
        id: 'cat-shawarma-sandwich',
        nameAr: 'سندويشات',
        nameEn: 'Sandwiches',
        sortOrder: 1,
        products: [
          { id: 'p-shawarma-chicken', nameAr: 'شاورما دجاج عربي', description: 'مع طرطور ومخلل.', price: 15 },
          { id: 'p-shawarma-meat', nameAr: 'شاورما لحم', description: 'لحم بلدي مع طحينة.', price: 22 },
          { id: 'p-shawarma-falafel', nameAr: 'سندويش فلافل', description: 'فلافل طازجة مع سلطة.', price: 6 },
        ],
      },
      {
        id: 'cat-shawarma-meals',
        nameAr: 'وجبات',
        nameEn: 'Meals',
        sortOrder: 2,
        products: [
          { id: 'p-shawarma-plate', nameAr: 'صحن شاورما دجاج', description: 'مع بطاطا وسلطة وخبز.', price: 35 },
          { id: 'p-shawarma-broasted', nameAr: 'بروستد ٤ قطع', description: 'مع بطاطا وكولسلو.', price: 30 },
        ],
      },
      {
        id: 'cat-shawarma-drinks',
        nameAr: 'مشروبات',
        nameEn: 'Drinks',
        sortOrder: 3,
        products: [
          { id: 'p-shawarma-cola', nameAr: 'مشروب غازي 330 مل', description: 'مبرّد.', price: 3 },
          { id: 'p-shawarma-water', nameAr: 'مياه معدنية 500 مل', description: '', price: 1.5 },
        ],
      },
    ],
  },
  {
    id: 'store-pharmacy',
    nameAr: 'صيدلية السموع',
    nameEn: 'Samou Pharmacy',
    phone: '0599100403',
    logoUrl: null,
    managerId: 'user-manager-pharmacy',
    latitude: 31.3962,
    longitude: 35.0691,
    categories: [
      {
        id: 'cat-pharmacy-otc',
        nameAr: 'أدوية بدون وصفة',
        nameEn: 'OTC',
        sortOrder: 1,
        products: [
          { id: 'p-pharmacy-panadol', nameAr: 'مسكّن باراسيتامول ٢٠ حبة', description: 'للصداع والحرارة.', price: 12 },
          { id: 'p-pharmacy-vitc', nameAr: 'فيتامين C فوّار', description: '١٠ أقراص فوّارة.', price: 18 },
        ],
      },
      {
        id: 'cat-pharmacy-baby',
        nameAr: 'مستلزمات الأطفال',
        nameEn: 'Baby Care',
        sortOrder: 2,
        products: [
          { id: 'p-pharmacy-diapers', nameAr: 'حفاضات مقاس ٣', description: 'عبوة ٤٤ حفاضة.', price: 55 },
          { id: 'p-pharmacy-wipes', nameAr: 'مناديل مبللة', description: 'عبوة ٧٢ منديل.', price: 9 },
        ],
      },
    ],
  },
];

interface SeedOrderLine {
  productId: string;
  quantity: number;
  unitPrice: number;
}

const ADDRESSES = [
  'حارة الرأس، بجانب مسجد عمر، البيت الحجري الثاني',
  'شارع المدرسة الثانوية، فوق محل الأدوات الكهربائية',
  'حارة البلد القديمة، مقابل مخبز الأصيل',
] as const;

async function seedUsers(): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const user of DEMO_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        phone: user.phone,
        passwordHash,
        role: user.role,
        isActive: user.isActive ?? true,
        isVerified: user.isVerified ?? false,
        isAvailable: user.isAvailable ?? false,
      },
      create: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        passwordHash,
        role: user.role,
        isActive: user.isActive ?? true,
        isVerified: user.isVerified ?? false,
        isAvailable: user.isAvailable ?? false,
      },
    });
  }

  console.log(`✓ ${DEMO_USERS.length} users`);
}

interface SeedVoucher {
  id: string;
  code: string;
  labelAr: string;
  labelEn: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  minSubtotal?: number;
  maxDiscount?: number;
  usageLimit?: number;
  expiresAt?: Date;
}

interface SeedOffer {
  id: string;
  storeId: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  startsAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
  sortOrder: number;
  /** Targeted product ids — empty array = store-wide offer. */
  productIds: string[];
}

/**
 * Demo offers — deterministic ids, every product id references a product that
 * `seedCatalogue` created above, so the offer cards render real items.
 */
const OFFERS: SeedOffer[] = [
  {
    id: 'offer-shawarma-falafel',
    storeId: 'store-shawarma',
    titleAr: 'فلافل بخصم ١ شيكل',
    titleEn: 'Falafel for 1 ILS less',
    descriptionAr: 'سندويش فلافل طازج بسعر مخفّض لفترة محدودة.',
    descriptionEn: 'Fresh falafel sandwich at a reduced price for a limited time.',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isActive: true,
    sortOrder: 1,
    productIds: ['p-shawarma-falafel'],
  },
  {
    id: 'offer-shawarma-plate-combo',
    storeId: 'store-shawarma',
    titleAr: 'صحن شاورما + مشروب',
    titleEn: 'Chicken plate + drink combo',
    descriptionAr: 'صحن شاورما دجاج مع أي مشروب غازي بطلب واحد.',
    descriptionEn: 'Chicken shawarma plate with any soft drink in one order.',
    isActive: true,
    sortOrder: 2,
    productIds: ['p-shawarma-plate', 'p-shawarma-cola'],
  },
  {
    id: 'offer-baraka-dairy',
    storeId: 'store-albaraka',
    titleAr: 'ألبان البلدة',
    titleEn: 'Local dairy favourites',
    descriptionAr: 'لبنة بلدية ولبن رايب بسعر السوق المحلي.',
    descriptionEn: 'Local labneh and laban at local market prices.',
    isActive: true,
    sortOrder: 1,
    productIds: ['p-baraka-labneh', 'p-baraka-yogurt'],
  },
  {
    id: 'offer-pharmacy-vitc',
    storeId: 'store-pharmacy',
    titleAr: 'مناعة أقوى',
    titleEn: 'Boost your immunity',
    descriptionAr: 'فيتامين C فوّار — ١٠ أقراص.',
    descriptionEn: 'Effervescent Vitamin C — 10 tablets.',
    isActive: true,
    sortOrder: 1,
    productIds: ['p-pharmacy-vitc'],
  },
];

async function seedOffers(): Promise<void> {
  for (const offer of OFFERS) {
    await prisma.offer.upsert({
      where: { id: offer.id },
      update: {
        storeId: offer.storeId,
        titleAr: offer.titleAr,
        titleEn: offer.titleEn,
        descriptionAr: offer.descriptionAr,
        descriptionEn: offer.descriptionEn,
        startsAt: offer.startsAt ?? null,
        expiresAt: offer.expiresAt ?? null,
        isActive: offer.isActive,
        sortOrder: offer.sortOrder,
      },
      create: {
        id: offer.id,
        storeId: offer.storeId,
        titleAr: offer.titleAr,
        titleEn: offer.titleEn,
        descriptionAr: offer.descriptionAr,
        descriptionEn: offer.descriptionEn,
        startsAt: offer.startsAt ?? null,
        expiresAt: offer.expiresAt ?? null,
        isActive: offer.isActive,
        sortOrder: offer.sortOrder,
      },
    });

    // Replace the product links idempotently (offer_products has a unique
    // (offerId, productId) constraint, so deletes + creates are safe).
    await prisma.offerProduct.deleteMany({ where: { offerId: offer.id } });
    if (offer.productIds.length > 0) {
      await prisma.offerProduct.createMany({
        data: offer.productIds.map(productId => ({ offerId: offer.id, productId })),
      });
    }
  }
  console.log(`✓ ${OFFERS.length} offers`);
}

const VOUCHERS: SeedVoucher[] = [
  {
    id: 'voucher-welcome10',
    code: 'WELCOME10',
    labelAr: 'خصم ترحيبي ١٠٪',
    labelEn: 'Welcome 10% off',
    discountType: 'PERCENT',
    discountValue: 10,
    maxDiscount: 15,
  },
  {
    id: 'voucher-fixed5',
    code: 'FIXED5',
    labelAr: 'خصم ٥ شواقل',
    labelEn: '5 ILS off',
    discountType: 'FIXED',
    discountValue: 5,
    minSubtotal: 30,
  },
  {
    id: 'voucher-expired-demo',
    code: 'EXPIREDDEMO',
    labelAr: 'كوبون منتهي (تجريبي)',
    labelEn: 'Expired (demo)',
    discountType: 'FIXED',
    discountValue: 3,
    expiresAt: new Date('2026-01-01T00:00:00Z'),
  },
];

async function seedVouchers(): Promise<void> {
  for (const voucher of VOUCHERS) {
    await prisma.voucher.upsert({
      where: { id: voucher.id },
      update: {
        code: voucher.code,
        labelAr: voucher.labelAr,
        labelEn: voucher.labelEn,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        minSubtotal: voucher.minSubtotal ?? null,
        maxDiscount: voucher.maxDiscount ?? null,
        usageLimit: voucher.usageLimit ?? null,
        isActive: true,
        expiresAt: voucher.expiresAt ?? null,
      },
      create: {
        id: voucher.id,
        code: voucher.code,
        labelAr: voucher.labelAr,
        labelEn: voucher.labelEn,
        discountType: voucher.discountType,
        discountValue: voucher.discountValue,
        minSubtotal: voucher.minSubtotal ?? null,
        maxDiscount: voucher.maxDiscount ?? null,
        usageLimit: voucher.usageLimit ?? null,
        isActive: true,
        expiresAt: voucher.expiresAt ?? null,
      },
    });
  }
  console.log(`✓ ${VOUCHERS.length} vouchers`);
}

async function seedDeliveryZones(): Promise<void> {
  for (const zone of DELIVERY_ZONES) {
    await prisma.deliveryZone.upsert({
      where: { id: zone.id },
      update: {
        nameAr: zone.nameAr,
        nameEn: zone.nameEn,
        fee: zone.fee,
        sortOrder: zone.sortOrder,
        isActive: true,
      },
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
  console.log(`✓ ${DELIVERY_ZONES.length} delivery zones`);
}

async function seedCatalogue(): Promise<void> {
  let categoryCount = 0;
  let productCount = 0;

  for (const store of STORES) {
    await prisma.store.upsert({
      where: { id: store.id },
      update: {
        nameAr: store.nameAr,
        nameEn: store.nameEn,
        phone: store.phone,
        logoUrl: store.logoUrl,
        managerId: store.managerId,
        latitude: store.latitude,
        longitude: store.longitude,
        isActive: true,
        isApproved: true,
      },
      create: {
        id: store.id,
        nameAr: store.nameAr,
        nameEn: store.nameEn,
        phone: store.phone,
        logoUrl: store.logoUrl,
        managerId: store.managerId,
        latitude: store.latitude,
        longitude: store.longitude,
        isActive: true,
        isApproved: true,
      },
    });

    for (const category of store.categories) {
      await prisma.category.upsert({
        where: { id: category.id },
        update: {
          nameAr: category.nameAr,
          nameEn: category.nameEn,
          sortOrder: category.sortOrder,
          storeId: store.id,
        },
        create: {
          id: category.id,
          nameAr: category.nameAr,
          nameEn: category.nameEn,
          sortOrder: category.sortOrder,
          storeId: store.id,
        },
      });
      categoryCount += 1;

      for (const product of category.products) {
        await prisma.product.upsert({
          where: { id: product.id },
          update: {
            nameAr: product.nameAr,
            description: product.description,
            price: product.price,
            isAvailable: product.isAvailable ?? true,
            categoryId: category.id,
            storeId: store.id,
          },
          create: {
            id: product.id,
            nameAr: product.nameAr,
            description: product.description,
            price: product.price,
            isAvailable: product.isAvailable ?? true,
            categoryId: category.id,
            storeId: store.id,
          },
        });
        productCount += 1;
      }
    }
  }

  console.log(`✓ ${STORES.length} stores, ${categoryCount} categories, ${productCount} products`);
}

interface SeedOrder {
  id: string;
  sequence: number;
  customerId: string;
  storeId: string;
  captainId: string | null;
  status: OrderStatus;
  address: string;
  lines: SeedOrderLine[];
}

const ORDERS: SeedOrder[] = [
  {
    id: 'order-demo-1',
    sequence: 1,
    customerId: 'user-customer-1',
    storeId: 'store-shawarma',
    captainId: 'user-captain-1',
    status: OrderStatus.ON_THE_WAY,
    address: ADDRESSES[0],
    lines: [
      { productId: 'p-shawarma-chicken', quantity: 2, unitPrice: 15 },
      { productId: 'p-shawarma-cola', quantity: 2, unitPrice: 3 },
    ],
  },
  {
    id: 'order-demo-2',
    sequence: 2,
    customerId: 'user-customer-2',
    storeId: 'store-albaraka',
    captainId: null,
    status: OrderStatus.PENDING,
    address: ADDRESSES[1],
    lines: [
      { productId: 'p-baraka-milk', quantity: 3, unitPrice: 6.5 },
      { productId: 'p-baraka-khobz', quantity: 2, unitPrice: 4 },
      { productId: 'p-baraka-rice', quantity: 2, unitPrice: 12 },
    ],
  },
  {
    id: 'order-demo-3',
    sequence: 3,
    customerId: 'user-customer-1',
    storeId: 'store-pharmacy',
    captainId: 'user-captain-2',
    status: OrderStatus.DELIVERED,
    address: ADDRESSES[2],
    lines: [{ productId: 'p-pharmacy-panadol', quantity: 1, unitPrice: 12 }],
  },
];

async function seedOrders(): Promise<void> {
  const today = new Date();

  await prisma.order.deleteMany({});
  console.log('  ♻️  Cleared existing orders');

  for (const order of ORDERS) {
    const totals = calculateOrderTotals(order.lines, env.deliveryFeeConfig);

    await prisma.order.create({
      data: {
        id: order.id,
        orderNumber: formatOrderNumber(today, order.sequence),
        customerId: order.customerId,
        storeId: order.storeId,
        captainId: order.captainId,
        status: order.status,
        customerAddressText: order.address,
        subtotal: totals.subtotal,
        deliveryFee: totals.deliveryFee,
        totalAmount: totals.totalAmount,
        paymentMethod: PaymentMethod.COD,
        items: {
          create: order.lines.map(line => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalPrice: lineTotal(line.unitPrice, line.quantity),
          })),
        },
        statusHistory: {
          create: historyFor(order),
        },
      },
    });

    console.log(
      `✓ ${order.id}: ${totals.itemCount} أصناف، رسوم التوصيل يحددها السائق، المجموع ${totals.totalAmount} ₪`
    );
  }

  const maxSequence = Math.max(...ORDERS.map(order => order.sequence));
  await prisma.dailyOrderSequence.upsert({
    where: { date: startOfDay(today) },
    update: { sequence: { set: maxSequence } },
    create: { date: startOfDay(today), sequence: maxSequence },
  });
}

function historyFor(order: SeedOrder): { status: OrderStatus; changedByUserId: string | null; note: string }[] {
  const ladder: OrderStatus[] = [
    OrderStatus.PENDING,
    OrderStatus.ACCEPTED,
    OrderStatus.PREPARING,
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.ON_THE_WAY,
    OrderStatus.DELIVERED,
  ];

  const upTo = ladder.indexOf(order.status);
  const reached = upTo === -1 ? [OrderStatus.PENDING] : ladder.slice(0, upTo + 1);

  return reached.map(status => ({
    status,
    changedByUserId: status === OrderStatus.PENDING ? order.customerId : null,
    note: 'بيانات تجريبية / Seed data',
  }));
}

async function seedCleanup(): Promise<void> {
  console.log('  ♻️  Cleaning tables (reverse dependency order)…');
  const passes = [
    prisma.orderItem.deleteMany({}),
    prisma.orderStatusHistory.deleteMany({}),
    prisma.rating.deleteMany({}),
    prisma.chatMessage.deleteMany({}),
    prisma.settlement.deleteMany({}),
    prisma.ledgerEntry.deleteMany({}),
    prisma.wallet.deleteMany({}),
    prisma.captainLocation.deleteMany({}),
    prisma.favorite.deleteMany({}),
    prisma.supportTicket.deleteMany({}),
    prisma.refreshToken.deleteMany({}),
    prisma.otpRequest.deleteMany({}),
    prisma.order.deleteMany({}),
    prisma.offerProduct.deleteMany({}),
    prisma.offer.deleteMany({}),
    prisma.product.deleteMany({}),
    prisma.category.deleteMany({}),
    prisma.dailyOrderSequence.deleteMany({}),
    prisma.voucher.deleteMany({}),
    prisma.store.deleteMany({}),
    prisma.user.deleteMany({}),
  ];
  await prisma.$transaction(passes);
  console.log('  ✓ Cleaned all tables');
}

async function seedWalletCredits(): Promise<void> {
  const targets: ({ storeId: string } | { userId: string })[] = [
    { storeId: 'store-albaraka' },
    { storeId: 'store-shawarma' },
    { storeId: 'store-pharmacy' },
    { userId: 'user-captain-1' },
    { userId: 'user-captain-2' },
  ];
  for (const target of targets) {
    await prisma.wallet.upsert({ where: target, update: {}, create: target });
  }
  console.log(`✓ ${targets.length} wallets`);

  const delivered = await prisma.order.findUnique({
    where: { id: 'order-demo-3' },
    select: { storeId: true, captainId: true, subtotal: true, deliveryFee: true, orderNumber: true },
  });
  if (delivered) {
    await prisma.$transaction(tx => creditDeliveredOrder(tx as any, delivered));
    console.log('✓ wallet credits for the delivered demo order');
  }
}

async function main(): Promise<void> {
  if (env.isProduction) {
    throw new Error(
      'Refusing to seed in production: demo passwords are public knowledge and this script ' +
        'creates/grows real rows. Seed only in development or staging.'
    );
  }

  console.log("🌱 Seeding Samou' Go — Neon PostgreSQL Database");
  await seedCleanup();
  await seedUsers();
  await seedCatalogue();
  await seedVouchers();
  await seedOffers();
  await seedDeliveryZones();
  await seedOrders();
  await seedWalletCredits();
  console.log(`\nDone. Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch(error => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await prisma.$disconnect();
  });