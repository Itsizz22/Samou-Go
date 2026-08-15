/**
 * Re-hash every demo account's password to `samou1234` — `npm run db:demo-passwords`
 *
 * Non-destructive: only touches the users' `passwordHash` (and phone/role/lifecycle
 * flags, in case the production DB drifted), never other tables. Unlike `db:seed`
 * it does not wipe orders, users, or catalogue — safe to run against a database
 * that already carries real data.
 *
 * Production guard: refuses `NODE_ENV=production` because these credentials are
 * public knowledge. For a one-off fix on the real deployment, run with
 * `NODE_ENV=development` against a URL that points at the production database
 * (the script resolves `DATABASE_URL` from the environment).
 *
 * Usage:
 *   npm run db:demo-passwords               # all demo users → samou1234
 *   DATABASE_URL=postgres://... npm run db:demo-passwords
 */
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { DEMO_PASSWORD, DEMO_USERS } from './demo-users';
import { phoneSchema } from '../modules/auth/auth.schemas';

async function main(): Promise<void> {
  if (env.isProduction) {
    throw new Error(
      'Refusing to re-hash demo passwords in production: these are public credentials. ' +
        'Run with NODE_ENV=development and a DATABASE_URL pointing at the target database.'
    );
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const user of DEMO_USERS) {
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
        isVerified: user.isVerified ?? false,
        isAvailable: user.isAvailable ?? false,
      },
      create: {
        id: existing?.id ?? user.id,
        name: user.name,
        phone,
        role: user.role,
        isActive: user.isActive ?? true,
        isVerified: user.isVerified ?? false,
        isAvailable: user.isAvailable ?? false,
        passwordHash,
      },
    });
  }

  console.log(`✓ Re-hashed ${DEMO_USERS.length} demo users to password "${DEMO_PASSWORD}"`);
  console.log(`  ADMIN: 0599000000 — test with POST /api/v1/auth/login`);
}

main()
  .catch(error => {
    console.error('Re-hash demo passwords failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });