import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
const h = vi.hoisted(() => {
  const root = '';
  const rows = new Map<string, Uint8Array>();
  return { root, rows,
    upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { content: Uint8Array } }) => { rows.set(where.key, create.content); }),
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => rows.has(where.key) ? { content: rows.get(where.key)! } : null),
    deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => { rows.delete(where.key); }),
  };
});
vi.mock('../config/env', () => ({ env: { isProduction: true } }));
vi.mock('../lib/prisma', () => ({ prisma: { storedUpload: { upsert: h.upsert, findUnique: h.findUnique, deleteMany: h.deleteMany } } }));
vi.mock('./uploads.config', async () => {
  const os = await import('node:os');
  const paths = await import('node:path');
  h.root = paths.join(os.tmpdir(), `samou-persistent-media-${Date.now()}`);
  return {
    uploadConfig: { maxBytes: 4096, publicOrigin: 'http://localhost' },
    uploadDirs: { rawDir: paths.join(h.root, 'raw'), finalDir: paths.join(h.root, 'final') },
  };
});
import { PersistentStorageAdapter } from './storage';
async function removeTestCache() {
  expect(path.dirname(path.resolve(h.root))).toBe(path.resolve(tmpdir()));
  expect(path.basename(h.root)).toMatch(/^samou-persistent-media-\d+$/);
  await rm(path.join(h.root, 'final'), { recursive: true, force: true });
}
beforeEach(async () => { h.rows.clear(); vi.clearAllMocks(); await removeTestCache(); });
afterAll(async () => { await removeTestCache(); await rm(h.root, { recursive: true, force: true }); });
describe('durable processed media', () => {
  it.each(['product/demo/md.webp', 'banner/admin/unique.webp'])('restores %s after disk loss and a new adapter instance', async (key) => {
    const bytes = Buffer.from('processed image fixture');
    await new PersistentStorageAdapter().writeFinal(key, bytes);
    await removeTestCache();
    const restored = await new PersistentStorageAdapter().readFinal(key);
    expect(restored).toEqual(bytes);
    expect(await readFile(path.join(h.root, 'final', key))).toEqual(bytes);
  });
  it('rejects finalization if the durable write fails', async () => {
    h.upsert.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(new PersistentStorageAdapter().writeFinal('product/demo/md.webp', Buffer.from('image'))).rejects.toThrow('database unavailable');
    expect(h.rows.size).toBe(0);
  });
  it('removes durable and cached copies together', async () => {
    const adapter = new PersistentStorageAdapter();
    await adapter.writeFinal('product/demo/md.webp', Buffer.from('image'));
    await adapter.removeFinal('product/demo/md.webp');
    expect(await adapter.readFinal('product/demo/md.webp')).toBeNull();
    await expect(readFile(path.join(h.root, 'final/product/demo/md.webp'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects traversal before accessing the database', async () => {
    await expect(new PersistentStorageAdapter().readFinal('../outside.webp')).rejects.toThrow();
    expect(h.findUnique).not.toHaveBeenCalled();
  });
});


describe('cold media pressure', () => {
  it('coalesces 100 simultaneous requests for one missing disk file', async () => {
    const key = 'product/stress/md.webp';
    const bytes = Buffer.from('complete media');
    h.rows.set(key, bytes);
    const adapter = new PersistentStorageAdapter();
    const results = await Promise.all(Array.from({ length: 100 }, () => adapter.readFinal(key)));
    expect(results.every(value => value?.equals(bytes))).toBe(true);
    expect(h.findUnique).toHaveBeenCalledTimes(1);
    expect(await readFile(path.join(h.root, 'final', key))).toEqual(bytes);
  });
  it('bounds distinct restores and releases capacity after failure', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    h.findUnique.mockImplementationOnce(async () => { await gate; throw new Error('offline'); });
    for (let i = 0; i < 3; i++) h.findUnique.mockImplementationOnce(async () => { await gate; return null; });
    const adapter = new PersistentStorageAdapter();
    const pending = Array.from({ length: 36 }, (_, i) => adapter.readFinal(`product/${i}/md.webp`));
    const settled = Promise.allSettled(pending);
    await expect(adapter.readFinal('product/excess/md.webp')).rejects.toMatchObject({ statusCode: 503, code: 'MEDIA_BUSY' });
    expect(h.findUnique).toHaveBeenCalledTimes(4);
    release();
    await settled;
    expect(await adapter.readFinal('product/retry/md.webp')).toBeNull();
    expect(h.findUnique).toHaveBeenCalledTimes(37);
  });
});
