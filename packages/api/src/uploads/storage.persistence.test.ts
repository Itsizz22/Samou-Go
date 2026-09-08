import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
const h = vi.hoisted(() => {
  const root = `${process.env.TEMP}/samou-persistent-media-${Date.now()}`;
  const rows = new Map<string, Uint8Array>();
  return { root, rows,
    upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { content: Uint8Array } }) => { rows.set(where.key, create.content); }),
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => rows.has(where.key) ? { content: rows.get(where.key)! } : null),
    deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => { rows.delete(where.key); }),
  };
});
vi.mock('../config/env', () => ({ env: { isProduction: true } }));
vi.mock('../lib/prisma', () => ({ prisma: { storedUpload: { upsert: h.upsert, findUnique: h.findUnique, deleteMany: h.deleteMany } } }));
vi.mock('./uploads.config', () => ({ uploadConfig: { maxBytes: 4096, publicOrigin: 'http://localhost' }, uploadDirs: { rawDir: `${h.root}/raw`, finalDir: `${h.root}/final` } }));
import { PersistentStorageAdapter } from './storage';
async function removeTestCache() {
  expect(path.dirname(path.resolve(h.root))).toBe(path.resolve(tmpdir()));
  expect(path.basename(h.root)).toMatch(/^samou-persistent-media-\d+$/);
  await rm(path.join(h.root, 'final'), { recursive: true, force: true });
}
beforeEach(async () => { h.rows.clear(); vi.clearAllMocks(); await removeTestCache(); });
afterAll(async () => { await removeTestCache(); await rm(h.root, { recursive: true, force: true }); });
describe('durable processed media', () => {
  it('restores byte-identical images and cache after disk loss and a new adapter instance', async () => {
    const bytes = Buffer.from('processed image fixture');
    await new PersistentStorageAdapter().writeFinal('product/demo/md.webp', bytes);
    await removeTestCache();
    const restored = await new PersistentStorageAdapter().readFinal('product/demo/md.webp');
    expect(restored).toEqual(bytes);
    expect(await readFile(path.join(h.root, 'final/product/demo/md.webp'))).toEqual(bytes);
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
