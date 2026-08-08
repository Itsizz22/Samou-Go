/**
 * Development seed — `npm run db:seed`
 *
 * Idempotent: every row carries an explicit deterministic id, so re-running
 * updates in place instead of piling up duplicates. Safe to run after every
 * `prisma migrate dev`.
 *
 * Never run against production: the passwords below are public knowledge.
 */
import { OrderStatus, PaymentMethod, UserRole } from '@samou-go/shared-types';
import { calculateOrderTotals, lineTotal } from '@samou-go/shared-types';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { formatOrderNumber } from '../lib/order-number';

const DEMO_PASSWORD = 'samou1234';

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
  categories: SeedCategory[];
}

const STORES: SeedStore[] = [
  {
    id: 'store-albaraka',
    nameAr: 'سوبرماركت البركة',
    nameEn: 'Al Baraka Supermarket',
    phone: '0599100201',
    logoUrl: null,
    managerId: 'user-manager-baraka',
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

interface SeedUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  isActive?: boolean;
  isVerified?: boolean;
  isAvailable?: boolean;
}

const USERS: SeedUser[] = [
  { id: 'user-admin', name: 'مدير النظام', phone: '0599000000', role: UserRole.ADMIN },
  { id: 'user-manager-baraka', name: 'محمود أبو عرام', phone: '0599100201', role: UserRole.STORE_MANAGER },
  { id: 'user-manager-shawarma', name: 'صالح المحاريق', phone: '0567100302', role: UserRole.STORE_MANAGER },
  { id: 'user-manager-pharmacy', name: 'رنا الهمص', phone: '0599100403', role: UserRole.STORE_MANAGER },
  { id: 'user-captain-1', name: 'أنس الدغامين', phone: '0599200101', role: UserRole.CAPTAIN, isVerified: true, isAvailable: true },
  { id: 'user-captain-2', name: 'يوسف أبو قبيطة', phone: '0567200102', role: UserRole.CAPTAIN, isVerified: true, isAvailable: true },
  { id: 'user-captain-3', name: 'كريم الشرحة', phone: '0599200103', role: UserRole.CAPTAIN, isActive: false },
  { id: 'user-customer-1', name: 'أحمد الشرحة', phone: '0599300101', role: UserRole.CUSTOMER },
  { id: 'user-customer-2', name: 'سُهى العواودة', phone: '0567300102', role: UserRole.CUSTOMER },
];

/**
 * Addresses are free text on purpose — Samou' has no reliable street numbering,
 * and the platform deliberately ships without GPS. The captain reads this and
 * calls the customer.
 */
const ADDRESSES = [
  'حارة الرأس، بجانب مسجد عمر، البيت الحجري الثاني',
  'شارع المدرسة الثانوية، فوق محل الأدوات الكهربائية',
  'حارة البلد القديمة، مقابل مخبز الأصيل',
] as const;

async function seedUsers(): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        phone: user.phone,
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

  console.log(`✓ ${USERS.length} users`);
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

/** Demo vouchers a tester can paste into the checkout box. */
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

interface SeedOrderLine {
  productId: string;
  quantity: number;
  unitPrice: number;
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

/**
 * Two baskets that straddle the tariff threshold, so the dashboards show both
 * fee tiers: 4 items → base fee, 7 items → bulk fee.
 */
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

  // Wipe all seed orders before recreating — order numbers are date-based so
  // a previous run with different ids would collide on the UNIQUE constraint.
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
      `✓ ${order.id}: ${totals.itemCount} أصناف، توصيل ${totals.deliveryFee} ₪، المجموع ${totals.totalAmount} ₪`
    );
  }
}

/** Replays the status ladder up to the order's current state. */
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

async function main(): Promise<void> {
  console.log(`🌱 Seeding Samou' Go — ${env.databaseUrl.replace(/:[^:@/]*@/, ':***@')}`);
  await seedUsers();
  await seedCatalogue();
  await seedVouchers();
  await seedOrders();
  console.log(`\nDone. Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch(error => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
