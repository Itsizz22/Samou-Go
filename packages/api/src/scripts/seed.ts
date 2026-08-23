/**
 * Production seed — `npm run db:seed`
 *
 * Seeds the admin account only. No demo data, no demo stores.
 */
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

import { env } from '../config/env';
import { hashPassword } from '../lib/password';
import { SEED_USERS, ADMIN_PASSWORD } from './demo-users';

import { PrismaClient } from '../../generated/prisma-postgres';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function main(): Promise<void> {
  if (env.isProduction) {
    throw new Error(
      'Refusing to seed in production. Seed only in development or staging.'
    );
  }

  console.log("🌱 Seeding Samou' Go — admin account only");

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        phone: user.phone,
        passwordHash,
        role: user.role,
        isActive: user.isActive ?? true,
        isVerified: user.isVerified ?? true,
      },
      create: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        passwordHash,
        role: user.role,
        isActive: user.isActive ?? true,
        isVerified: user.isVerified ?? true,
      },
    });
  }

  console.log(`✓ ${SEED_USERS.length} admin user seeded`);
  console.log(`  Phone: 0566010623 | Password: ${ADMIN_PASSWORD}`);
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
