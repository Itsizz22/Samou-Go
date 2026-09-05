/**
 * Deactivate demo/seed users in the production database.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx packages/api/src/scripts/deactivate-demo-users.ts --yes
 *
 * Safety:
 *   - Requires the explicit `--yes` flag to proceed.
 *   - Only soft-deactivates (isActive: false) — never hard-deletes.
 *   - Revokes all refresh tokens for each deactivated user.
 *   - Skips users that are already inactive.
 *   - Will NOT deactivate the admin account (user-admin) if it's the only admin.
 */
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

import { PrismaClient } from '../../generated/prisma-postgres';

const confirmed = process.argv.includes('--yes');

/** Known demo user IDs from seed data */
const DEMO_USER_IDS = [
  'user-admin',
  'user-manager-baraka',
  'user-manager-shawarma',
  'user-manager-pharmacy',
  'user-captain-1',
  'user-captain-2',
  'user-captain-3',
  'user-customer-1',
  'user-customer-2',
];

async function main(): Promise<void> {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }
  if (!confirmed) {
    console.log('⚠️  This will deactivate the following demo user accounts:');
    console.log(`   ${DEMO_USER_IDS.join(', ')}`);
    console.log('\nRun with --yes to confirm:');
    console.log('   npx tsx packages/api/src/scripts/deactivate-demo-users.ts --yes');
    process.exit(0);
  }

  const prisma = new PrismaClient();

  try {
    // Safety check: count active admins before deactivating user-admin
    const activeAdminCount = await prisma.user.count({
      where: { role: 'ADMIN', isActive: true },
    });

    const adminUser = await prisma.user.findUnique({ where: { id: 'user-admin' } });
    const willDeactivateAdmin = adminUser?.isActive && activeAdminCount <= 1;

    if (willDeactivateAdmin) {
      console.log('\n⚠️  WARNING: user-admin is the ONLY active admin account!');
      console.log('   Deactivating it will leave the platform with no admin access.');
      console.log('   Please create a new admin account first (create-admin.ts).');
      console.log('   Skipping user-admin deactivation.\n');
    }

    let deactivated = 0;
    let skipped = 0;

    for (const userId of DEMO_USER_IDS) {
      // Skip the admin if it's the only admin
      if (userId === 'user-admin' && willDeactivateAdmin) {
        skipped++;
        continue;
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        console.log(`   ⏭  ${userId} — not found, skipping`);
        skipped++;
        continue;
      }
      if (!user.isActive) {
        console.log(`   ⏭  ${userId} (${user.phone}) — already inactive, skipping`);
        skipped++;
        continue;
      }

      // Soft-deactivate + revoke sessions
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { isActive: false },
        }),
        prisma.refreshToken.deleteMany({ where: { userId } }),
      ]);

      console.log(`   ✅ ${userId} (${user.phone}) — deactivated, sessions revoked`);
      deactivated++;
    }

    console.log(`\nDone: ${deactivated} deactivated, ${skipped} skipped.`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch(error => {
    console.error(`\n❌ ${error.message}`);
    process.exitCode = 1;
  });
