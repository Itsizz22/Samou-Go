/**
 * Targeted admin bootstrap — `npm run db:admin-password`
 *
 * Upserts the ADMIN account for a given phone with a fresh bcrypt hash for the
 * given password, without touching any other table. Unlike `db:seed`, this
 * never wipes orders/users/catalogue, so it is safe to point at a database
 * that already carries real data.
 *
 * Usage:
 *   npm run db:admin-password                       # 0599000000 / samou1234
 *   npm run db:admin-password -- 0599000000 sup3rSecret
 *
 * The phone is run through the same phoneSchema as the login endpoint, so
 * `+970...` / `00970...` forms are normalised before the lookup.
 */
import { UserRole } from '@samou-go/shared-types';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/password';
import { phoneSchema } from '../modules/auth/auth.schemas';

const PHONE = process.argv[2] ?? '0599000000';
const PASSWORD = process.argv[3] ?? 'samou1234';

async function main(): Promise<void> {
  if (env.isProduction) {
    throw new Error(
      'Refusing to set an admin password in production: this upserts a known, ' +
        'public demo credential. Run it only in development or staging.'
    );
  }

  const phone = phoneSchema.parse(PHONE);
  if (PASSWORD.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const passwordHash = await hashPassword(PASSWORD);

  const existing = await prisma.user.findUnique({ where: { phone } });
  const user = await prisma.user.upsert({
    where: { id: existing?.id ?? 'user-admin' },
    update: { phone, role: UserRole.ADMIN, isActive: true, passwordHash },
    create: {
      id: existing?.id ?? 'user-admin',
      name: 'مدير النظام',
      phone,
      role: UserRole.ADMIN,
      isActive: true,
      passwordHash,
    },
  });

  console.log(`✓ ADMIN ${user.role} — ${user.phone} (${user.name})`);
  console.log('  Password hash set; test with: curl -X POST /api/v1/auth/login');
}

main()
  .catch(error => {
    console.error('Set admin password failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });