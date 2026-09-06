#!/usr/bin/env tsx
/**
 * Backfill human-friendly identifiers for existing records.
 *
 * Usage:
 *   cd packages/api && npx tsx src/scripts/backfill-identifiers.ts
 *
 * This script:
 *   1. Generates `orderNumber` for any Order missing one (SQ-YYMMDD-XXXX format).
 *   2. Generates `slug` for any Store missing one (URL-safe from nameAr).
 *   3. Generates `userCode` for any User missing one (CUST-XXXXX / CAPT-XXXXX).
 *
 * Safe to run multiple times — it only touches records where the field is NULL.
 */

import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { generateStoreSlug, generateCustomerCode, generateCaptainCode } from '@samou-go/shared-types';

/** Deterministic seed from a string for userCode generation. */
function codeSeed(value: string): number {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 8);
  return parseInt(hex, 16) % 32_768;
}

async function backfillOrderNumbers(): Promise<number> {
  // All orders already have orderNumber (required field). The new SQ-YYMMDD-XXXX
  // format applies to new orders only. Existing SG-YYMMDD-XXXX numbers are preserved.
  const count = await prisma.order.count();
  console.log(`  ✅ Orders: ${count} total — all have orderNumber (new orders use SQ- prefix)`);
  return 0;
}

async function backfillStoreSlugs(): Promise<number> {
  const orphans = await prisma.store.findMany({
    where: { slug: null },
    select: { id: true, nameAr: true },
  });

  if (orphans.length === 0) {
    console.log('  ✅ Stores: all have slug — nothing to backfill');
    return 0;
  }

  console.log(`  📦 Stores: ${orphans.length} records missing slug — backfilling…`);

  let count = 0;
  for (const store of orphans) {
    const slug = generateStoreSlug(store.nameAr);
    await prisma.store.update({
      where: { id: store.id },
      data: { slug },
    });
    count++;
  }

  console.log(`  ✅ Stores: backfilled ${count} slugs`);
  return count;
}

async function backfillUserCodes(): Promise<number> {
  const orphans = await prisma.user.findMany({
    where: { userCode: null },
    select: { id: true, phone: true, role: true },
  });

  if (orphans.length === 0) {
    console.log('  ✅ Users: all have userCode — nothing to backfill');
    return 0;
  }

  console.log(`  📦 Users: ${orphans.length} records missing userCode — backfilling…`);

  let count = 0;
  for (const user of orphans) {
    const seed = codeSeed(user.phone);
    const userCode = user.role === 'CAPTAIN'
      ? generateCaptainCode(seed)
      : generateCustomerCode(seed);
    await prisma.user.update({
      where: { id: user.id },
      data: { userCode },
    });
    count++;
  }

  console.log(`  ✅ Users: backfilled ${count} user codes`);
  return count;
}

async function main(): Promise<void> {
  console.log('\n🔧 Samou Quick — Identifier Backfill Script');
  console.log(`   Time: ${new Date().toISOString()}\n`);

  const orders = await backfillOrderNumbers();
  const stores = await backfillStoreSlugs();
  const users = await backfillUserCodes();

  console.log(`\n📊 Summary:`);
  console.log(`   Orders:  ${orders} backfilled`);
  console.log(`   Stores:  ${stores} backfilled`);
  console.log(`   Users:   ${users} backfilled`);
  console.log(`   Total:   ${orders + stores + users} records updated\n`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
