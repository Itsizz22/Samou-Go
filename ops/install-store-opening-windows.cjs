// Run from the repository root with DATABASE_URL configured for the target DB.
const fs = require('node:fs');
const { PrismaClient } = require('../packages/api/generated/prisma-postgres');
const db = new PrismaClient();
const sql = fs.readFileSync(require('node:path').join(__dirname, 'store-opening-windows.sql'), 'utf8');
function splitStatements(text) {
  const pieces = text.split('$$'); const result = []; let buffer = '';
  for (let i = 0; i < pieces.length; i++) {
    if (i % 2) { buffer += '$$' + pieces[i] + '$$'; continue; }
    const chunks = pieces[i].split(';'); buffer += chunks.shift();
    for (const chunk of chunks) { if (buffer.trim()) result.push(buffer); buffer = chunk; }
  }
  if (buffer.trim()) result.push(buffer);
  return result;
}
(async () => {
  await db.$transaction(async tx => {
    for (const statement of splitStatements(sql)) await tx.$executeRawUnsafe(statement);
    const rows = await tx.$queryRawUnsafe("SELECT pg_get_functiondef('samou_sync_daily_ordering_banner()'::regprocedure) AS definition");
    let definition = rows[0].definition;
    if (!definition.includes('PERFORM samou_sync_store_opening_windows();')) {
      definition = definition.replace(/\bBEGIN\b/, 'BEGIN\n  PERFORM samou_sync_store_opening_windows();');
      if (!definition.includes('PERFORM samou_sync_store_opening_windows();')) throw new Error('Unsupported scheduler definition');
      await tx.$executeRawUnsafe(definition);
    }
    await tx.$queryRawUnsafe('SELECT samou_sync_daily_ordering_banner()');
  }, { timeout: 30000 });
  console.log('Automatic shift opening installed; API continues enforcing closing time.');
})().catch(error => { console.error(error.code || error.name); process.exitCode = 1; }).finally(() => db.$disconnect());
