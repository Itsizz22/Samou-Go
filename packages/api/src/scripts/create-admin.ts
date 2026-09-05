/**
 * Create a real admin account in any environment (including production).
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx packages/api/src/scripts/create-admin.ts
 *
 * Interactive prompts — nothing is hard-coded. The script will ask for:
 *   1. Phone number (Palestinian format: 059/056/050/052/051/054)
 *   2. Display name
 *   3. Password (minimum 8 characters, entered twice for confirmation)
 *
 * Safety:
 *   - Never logs or stores the password in plaintext.
 *   - Uses the same bcrypt hash as the rest of the app.
 *   - Will NOT overwrite an existing user with the same phone number.
 */
import readline from 'node:readline';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

import { hashPassword } from '../lib/password';
import { PrismaClient } from '../../generated/prisma-postgres';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main(): Promise<void> {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Set it in the environment before running this script.');
  }

  console.log('\n🔧 Create Admin Account — Samou\' Go\n');

  // ── Collect input ────────────────────────────────────────────────
  const phone = (await ask('Phone (e.g. 0591234567): ')).trim();
  if (!/^0(59|56|50|52|51|54)\d{7}$/.test(phone)) {
    throw new Error('Invalid Palestinian phone number. Must start with 059/056/050/052/051/054 and be 10 digits.');
  }

  const name = (await ask('Display name (Arabic or English): ')).trim();
  if (!name) throw new Error('Name cannot be empty.');

  const password = await ask('Password (min 8 chars): ');
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');

  const confirm = await ask('Confirm password: ');
  if (password !== confirm) throw new Error('Passwords do not match.');

  rl.close();

  // ── Connect and create ───────────────────────────────────────────
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new Error(
        `A user with phone ${phone} already exists (id: ${existing.id}, role: ${existing.role}). ` +
        `Use the admin dashboard to change their role instead.`
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        phone,
        name,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
        isVerified: true,
      },
    });

    console.log(`\n✅ Admin account created successfully!`);
    console.log(`   ID:    ${user.id}`);
    console.log(`   Phone: ${user.phone}`);
    console.log(`   Name:  ${user.name}`);
    console.log(`   Role:  ${user.role}`);
    console.log(`\n   You can now log in at web-admin with:`);
    console.log(`   Phone: ${phone}`);
    console.log(`   Password: <the one you just entered>`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch(error => {
    console.error(`\n❌ ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });
