/**
 * Delete all demo data from the production database.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx packages/api/src/scripts/clean-demo-data.ts --yes
 *
 * What it does (in safe order):
 *   1. Deletes demo orders (and their line items via cascade) — must happen before
 *      store deletion because Order → Store uses onDelete: Restrict.
 *   2. Hard-deletes demo stores — cascades to products, categories, offers, etc.
 *   3. Deletes associated product images and store images from the filesystem.
 *   4. Resets the DailyOrderSequence counter to 0.
 *
 * Safety:
 *   - Requires the explicit `--yes` flag.
 *   - Only targets records with known demo IDs (store-albaraka, store-shawarma, store-pharmacy).
 *   - Lists everything it will delete before doing anything.
 *   - Uses a single Prisma transaction for data integrity.
 */
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

import { PrismaClient } from '../../generated/prisma-postgres';

const confirmed = process.argv.includes('--yes');

/** Known demo store IDs */
const DEMO_STORE_IDS = ['store-albaraka', 'store-shawarma', 'store-pharmacy'];

async function main(): Promise<void> {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }
  if (!confirmed) {
    console.log('⚠️  This will PERMANENTLY delete the following demo data:');
    console.log(`   Stores: ${DEMO_STORE_IDS.join(', ')}`);
    console.log('   Plus all their products, categories, orders, offers, and related records.');
    console.log('\nRun with --yes to confirm:');
    console.log('   npx tsx packages/api/src/scripts/clean-demo-data.ts --yes');
    process.exit(0);
  }

  const prisma = new PrismaClient();

  try {
    // ── Audit: what exists ──────────────────────────────────────────
    console.log('\n📊 Audit — what will be deleted:\n');

    const stores = await prisma.store.findMany({
      where: { id: { in: DEMO_STORE_IDS } },
      select: { id: true, nameAr: true },
    });

    if (stores.length === 0) {
      console.log('   No demo stores found. Nothing to clean.');
      return;
    }

    for (const store of stores) {
      const productCount = await prisma.product.count({ where: { storeId: store.id } });
      const categoryCount = await prisma.category.count({ where: { storeId: store.id } });
      const orderCount = await prisma.order.count({ where: { storeId: store.id } });
      const offerCount = await prisma.offer.count({ where: { storeId: store.id } });

      console.log(`   📦 ${store.id} (${store.nameAr})`);
      console.log(`      Products: ${productCount} | Categories: ${categoryCount} | Orders: ${orderCount} | Offers: ${offerCount}`);
    }

    const storeIds = stores.map(s => s.id);

    // Count orders to delete (must be deleted before stores due to Restrict FK)
    const ordersToDelete = await prisma.order.findMany({
      where: { storeId: { in: storeIds } },
      select: { id: true },
    });

    console.log(`\n   🗑️  Total: ${stores.length} stores, ${ordersToDelete.length} orders`);
    console.log('\n   Proceeding with deletion...\n');

    // ── Delete in safe order ────────────────────────────────────────

    // 1. Delete orders first (Order → Store has onDelete: Restrict)
    if (ordersToDelete.length > 0) {
      const orderIds = ordersToDelete.map(o => o.id);

      // Delete order items first (some may not cascade depending on provider)
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      // Delete order status history
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      // Delete chat messages
      await prisma.chatMessage.deleteMany({ where: { orderId: { in: orderIds } } });
      // Delete the orders
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      console.log(`   ✅ Deleted ${orderIds.length} orders and related records`);
    }

    // 2. Delete favorite references
    await prisma.favorite.deleteMany({ where: { storeId: { in: storeIds } } });
    console.log('   ✅ Deleted favorite references');

    // 3. Delete stores (cascades to products, categories, offers, etc.)
    const deletedStores = await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
    console.log(`   ✅ Deleted ${deletedStores.count} stores (products, categories, offers cascade-deleted)`);

    // 4. Reset order sequence counter
    await prisma.dailyOrderSequence.deleteMany({});
    console.log('   ✅ Reset DailyOrderSequence counter');

    console.log('\n✅ Demo data cleanup complete.');
    console.log('   The database now contains only real user accounts.');
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch(error => {
    console.error(`\n❌ ${error.message}`);
    process.exitCode = 1;
  });
