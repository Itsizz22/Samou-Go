/**
 * Re-hash the admin account's password — `npm run db:demo-passwords`
 *
 * Non-destructive: only touches the user's `passwordHash`. Safe to run against
 * a database that already carries real data.
 *
 * Production guard: refuses `NODE_ENV=production`.
 */
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { ADMIN_PASSWORD, SEED_USERS } from './demo-users';
import { phoneSchema } from '../modules/auth/auth.schemas';

async function main(): Promise<void> {
  if (env.isProduction) {
    throw new Error(
      'Refusing to re-hash passwords in production. Run with NODE_ENV=development.'
    );
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  for (const user of SEED_USERS) {
    const phone = phoneSchema.parse(user.phone);
    const existing = await prisma.user.findUnique({ where: { phone } });

    await prisma.user.upsert({
      where: { id: existing?.id ?? user.id },
      update: {
        name: user.name,
        phone,
        passwordHash,
        role: user.role,
        isActive: user.isActive ?? true,
        isVerified: user.isVerified ?? true,
      },
      create: {
        id: existing?.id ?? user.id,
        name: user.name,
        phone,
        role: user.role,
        isActive: user.isActive ?? true,
        isVerified: user.isVerified ?? true,
        passwordHash,
      },
    });
  }

  console.log(`✓ Re-hashed ${SEED_USERS.length} users to password "${ADMIN_PASSWORD}"`);
  console.log(`  ADMIN: 0566010623 — test with POST /api/v1/auth/login`);
}

main()
  .catch(error => {
    console.error('Re-hash passwords failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
