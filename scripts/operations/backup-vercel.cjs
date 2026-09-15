/** Read-only PostgreSQL snapshot -> private Vercel Blob. No database writes. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { put, get } = require('@vercel/blob');
const { createHash } = require('node:crypto');
async function digest(stream) {
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}
async function uploadVerified(file, destination, blob = { put, get }) {
  const sha256 = await digest(fs.createReadStream(file));
  const uploaded = await blob.put(destination, fs.createReadStream(file), {
    access: 'private', addRandomSuffix: false, allowOverwrite: false,
    multipart: true, contentType: 'application/octet-stream',
  });
  if (!new URL(uploaded.url).hostname.endsWith('.private.blob.vercel-storage.com')) throw new Error('Private storage required');
  const downloaded = await blob.get(uploaded.url, { access: 'private', useCache: false });
  if (!downloaded || downloaded.statusCode !== 200 || !downloaded.stream) throw new Error('Backup readback failed');
  if (await digest(downloaded.stream) !== sha256) throw new Error('Backup checksum mismatch');
  return sha256;
}
async function main() {
  const required = ['DATABASE_URL', 'BLOB_READ_WRITE_TOKEN'];
  for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('PostgreSQL required');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'samou-backup-'));
  const file = path.join(directory, 'database.dump');
  const started = Date.now();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = `backups/postgres/${stamp}.dump`;
  const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1), PGSSLMODE: url.searchParams.get('sslmode') || 'require', PGCONNECT_TIMEOUT: '20' };
  const executable = name => process.env.PG_BIN ? path.join(process.env.PG_BIN, name + (process.platform === 'win32' ? '.exe' : '')) : name;
  try {
    const dumped = spawnSync(executable('pg_dump'), ['--format=custom', '--no-owner', '--no-acl', '--schema=public', '--file', file], { env: pgEnv, windowsHide: true, timeout: 240000, encoding: 'utf8' });
    if (dumped.status !== 0) throw new Error('pg_dump failed (diagnostic withheld to protect credentials)');
    const listed = spawnSync(executable('pg_restore'), ['--list', file], { windowsHide: true, timeout: 30000, encoding: 'utf8' });
    if (listed.status !== 0 || !listed.stdout.includes('TABLE DATA')) throw new Error('Backup validation failed');
    const bytes = fs.statSync(file).size;
    const sha256 = await uploadVerified(file, destination);
    const result = { event: 'backup.completed', severity: 'Informational', provider: 'vercel-private-blob', destination, bytes, sha256, elapsedMs: Date.now() - started, createdAt: new Date().toISOString() };
    await put('backups/status/latest.json', JSON.stringify(result), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    console.log(JSON.stringify(result));
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
}
module.exports = { uploadVerified };
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ event: 'backup.failed', severity: 'Critical', reason: error?.code ? String(error.code) : 'Backup prerequisite or operation failed' })); process.exitCode = 1; });
