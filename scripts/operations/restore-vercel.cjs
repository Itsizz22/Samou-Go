/** Restores only into the workflow's ephemeral localhost database, never production. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { createHash } = require('node:crypto');
const { get, list, del } = require('@vercel/blob');
async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw Error('Restore drill restricted to isolated workflow');
  const pgEnv = { PATH: process.env.PATH, PGHOST: '127.0.0.1', PGPORT: '5432', PGUSER: 'validation', PGPASSWORD: 'validation-local-only', PGDATABASE: 'backup_validation', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '10' };
  const executable = name => path.join(process.env.PG_BIN || '/usr/lib/postgresql/18/bin', name);
  const run = (name, args) => {
    const result = spawnSync(executable(name), args, { env: pgEnv, encoding: 'utf8', timeout: 180000 });
    if (result.status !== 0) throw Error('Isolated restore command failed');
    return result.stdout;
  };
  // Fail closed if this local database already contains application tables.
  if (run('psql', ['-Atc', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"]).trim() !== '0') throw Error('Restore target is not empty');
  const status = await get('backups/status/latest.json', { access: 'private', useCache: false });
  if (!status || status.statusCode !== 200) throw Error('Success marker unavailable');
  const chunks = [];
  for await (const chunk of status.stream) chunks.push(Buffer.from(chunk));
  const manifest = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!/^backups\/postgres\/\d{4}-\d{2}-\d{2}T[\dZ-]+\.dump$/.test(manifest.destination)) throw Error('Unexpected backup path');
  const backup = await get(manifest.destination, { access: 'private', useCache: false });
  if (!backup || backup.statusCode !== 200) throw Error('Uploaded backup unavailable');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'samou-restore-'));
  const dump = path.join(directory, 'database.dump');
  const toc = path.join(directory, 'restore.list');
  try {
    await pipeline(backup.stream, fs.createWriteStream(dump, { flags: 'wx' }));
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(dump)) hash.update(chunk);
    if (hash.digest('hex') !== manifest.sha256) throw Error('Restore checksum mismatch');
    const entries = run('pg_restore', ['--list', dump]);
    fs.writeFileSync(toc, entries.split('\n').filter(line => !line.includes(' SCHEMA - public ')).join('\n'));
    run('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--use-list', toc, '--dbname', 'backup_validation', dump]);
    const tables = Number(run('psql', ['-Atc', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"]).trim());
    if (tables < 1) throw Error('Restored database is empty');
    console.log(JSON.stringify({ event: 'backup.restore_verified', tables, sha256: manifest.sha256 }));
    // Keep seven newest daily snapshots, and never delete the verified current backup.
    const blobs = [];
    let cursor;
    do {
      const page = await list({ prefix: 'backups/postgres/', cursor, limit: 1000 });
      blobs.push(...page.blobs.filter(blob => /^backups\/postgres\/\d{4}-\d{2}-\d{2}T[\dZ-]+\.dump$/.test(blob.pathname)));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    blobs.sort((a, b) => b.pathname.localeCompare(a.pathname));
    const expired = blobs.slice(7).filter(blob => blob.pathname !== manifest.destination);
    if (expired.length) await del(expired.map(blob => blob.url));
    console.log(JSON.stringify({ event: 'backup.retention_applied', retained: blobs.length - expired.length, removed: expired.length }));
  } finally {
    for (const file of [dump, toc]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
}
main().catch(() => { console.error(JSON.stringify({ event: 'backup.restore_failed', severity: 'Critical', reason: 'Isolated restore or retention failed; diagnostics withheld' })); process.exitCode = 1; });
