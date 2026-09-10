// Recover only the known, zero-step table-name failure from the first rollout.
const { PrismaClient } = require('../generated/prisma-postgres');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const migration = '20260910170000_product_original_price';
(async () => {
  const db = new PrismaClient();
  try {
    const rows = await db.$queryRaw`SELECT logs, applied_steps_count FROM "_prisma_migrations" WHERE migration_name = ${migration} AND finished_at IS NULL AND rolled_back_at IS NULL`;
    if (!rows.length) return;
    if (rows.length !== 1 || rows[0].applied_steps_count !== 0 || !/Product.*does not exist/s.test(rows[0].logs ?? '')) throw new Error('Unexpected migration failure; refusing automatic recovery.');
    const columns = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'products' AND column_name = 'originalPrice'`;
    if (columns.length) throw new Error('Discount column already exist; refusing zero-step recovery.');
    await db.$disconnect();
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'resolve', '--rolled-back', migration, '--schema', path.resolve('prisma/schema.prisma')], { stdio: 'inherit' });
  } finally { await db.$disconnect(); }
})().catch(() => { console.error('Product discount migration recovery failed; inspect migration status before proceeding.'); process.exitCode = 1; });
