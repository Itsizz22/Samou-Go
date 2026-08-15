/**
 * One-off migration for the real (PostgreSQL / Neon) database —
 * `npm run db:migrate-demo-passwords`
 *
 * Unlike `db:demo-passwords` (which binds the SQLite client in dev), this
 * script connects through the Postgres-generated client using `DATABASE_URL`
 * from the environment, so it works against Neon directly. It re-hashes every
 * demo account's password to `samou1234` — non-destructive (only touches
 * users, never other tables).
 *
 * Safety:
 *  - Refuses to run without `DATABASE_URL`.
 *  - Refuses to run without the explicit `--yes` flag, because these demo
 *    credentials are public knowledge and this script changes real users'
 *    password hashes.
 *
 * Usage:
 *   $env:DATABASE_URL="postgresql://..." ; npm run db:migrate-demo-passwords -- --yes
 */
import { PrismaClient } from '../../generated/prisma-postgres';
import bcrypt from 'bcryptjs';
import { DEMO_PASSWORD, DEMO_USERS } from './demo-users';
import { phoneSchema } from '../modules/auth/auth.schemas';

const DATABASE_URL = process.env.DATABASE_URL;
const confirmed = process.argv.includes('--yes');

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Point it at the target PostgreSQL database.');
  }
  if (!confirmed) {
    throw new Error(
      'Refusing to run without --yes: this re-hashes real users to a public demo password. ' +
        'Re-run with --yes to confirm you understand.'
    );
  }

  const prisma = new PrismaClient();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  let upserted = 0;
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
    upserted += 1;
    console.log(`✓ ${user.role.padEnd(14)} ${phone}`);
  }

  console.log(`\nDone: ${upserted}/${DEMO_USERS.length} demo users now authenticate as "${DEMO_PASSWORD}".`);

  await prisma.$disconnect();
}

main()
  .catch(error => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  });