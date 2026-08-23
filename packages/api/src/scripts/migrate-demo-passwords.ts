/**
 * One-off migration for the real (PostgreSQL / Neon) database —
 * `npm run db:migrate-demo-passwords`
 *
 * Re-hashes the admin account's password. Safety:
 *  - Refuses to run without `DATABASE_URL`.
 *  - Refuses to run without the explicit `--yes` flag.
 */
import { PrismaClient } from '../../generated/prisma-postgres';
import bcrypt from 'bcryptjs';
import { ADMIN_PASSWORD, SEED_USERS } from './demo-users';
import { phoneSchema } from '../modules/auth/auth.schemas';

const DATABASE_URL = process.env.DATABASE_URL;
const confirmed = process.argv.includes('--yes');

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Point it at the target PostgreSQL database.');
  }
  if (!confirmed) {
    throw new Error(
      'Refusing to run without --yes. Re-run with --yes to confirm.'
    );
  }

  const prisma = new PrismaClient();

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  let upserted = 0;
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
    upserted += 1;
    console.log(`✓ ${user.role.padEnd(14)} ${phone}`);
  }

  console.log(`\nDone: ${upserted}/${SEED_USERS.length} users seeded.`);

  await prisma.$disconnect();
}

main()
  .catch(error => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  });
