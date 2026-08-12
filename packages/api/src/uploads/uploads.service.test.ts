import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { UserRole } from '@samou-go/shared-types';
import { HttpError } from '../lib/http-error';

/**
 * Uploads pipeline tests — avatar + product images against the real local
 * storage adapter (temp dir) with a mocked Prisma client. Proves the security
 * gates (key ownership, size cap, magic-byte sniffing) and the round-trip that
 * ends with a processed file + a DB attachment.
 */

// The uploads modules read `env` at import time, so point them at a scratch
// directory BEFORE they are (dynamically) loaded. Env-module free imports are
// loaded statically above; everything else resolves below in `beforeAll`.
process.env.UPLOAD_DIR = path.join(tmpdir(), `samou-uploads-test-${Date.now()}`);
process.env.UPLOAD_MAX_BYTES = '4096';
process.env.PUBLIC_API_ORIGIN = 'http://localhost:4000';

const h = vi.hoisted(() => {
  const state = {
    product: {
      id: 'p1',
      storeId: 's1',
      imageUrl: null as string | null,
    },
    store: {
      id: 's1',
      managerId: 'u-manager' as string | null,
      logoUrl: null as string | null,
    },
    currentUser: null as null | { id: string; profileImageUrl: string | null; profileImageKey: string | null },
    userUpdated: null as null | { profileImageUrl: string; profileImageKey: string },
    userRemoved: false,
  };

  const prisma = {
    user: {
      findUnique: vi.fn(async () => state.currentUser),
      update: vi.fn(
        async ({ data }: { data: { profileImageUrl: string; profileImageKey: string } }) => {
          state.userUpdated = {
            profileImageUrl: data.profileImageUrl,
            profileImageKey: data.profileImageKey,
          };
          if (state.currentUser) {
            state.currentUser.profileImageUrl = data.profileImageUrl;
            state.currentUser.profileImageKey = data.profileImageKey;
          }
          return { id: 'u1', profileImageUrl: data.profileImageUrl };
        }
      ),
      updateMany: vi.fn(async () => {
        state.userRemoved = true;
        return { count: 1 };
      }),
    },
    product: {
      findUnique: vi.fn(async () => state.product),
      update: vi.fn(async ({ data }: { data: { imageUrl: string | null } }) => {
        if (state.product) state.product.imageUrl = data.imageUrl;
        return state.product;
      }),
    },
    store: {
      findUnique: vi.fn(async () => state.store),
      update: vi.fn(async ({ data }: { data: { logoUrl: string | null } }) => {
        if (state.store) state.store.logoUrl = data.logoUrl;
        return state.store;
      }),
    },
  };

  return { state, prisma };
});

vi.mock('../lib/prisma', () => ({ prisma: h.prisma }));

let sniffImageType: (buffer: Buffer) => import('./image').ImageMime | null;
let storage: import('./storage').StorageAdapter;
let finalizeUpload: (caller: import('./uploads.service').UploadCaller, key: string, kind: import('@samou-go/shared-types').UploadKind) => Promise<{ url: string; width: number; height: number }>;
let presign: (caller: import('./uploads.service').UploadCaller, input: { contentType: string; kind: import('@samou-go/shared-types').UploadKind; resourceId?: string }) => Promise<{ uploadUrl: string; key: string; contentType: string; maxBytes: number }>;
let storeRaw: (key: string, body: Readable, caller: import('./uploads.service').UploadCaller) => Promise<void>;
let removeUpload: (key: string, caller: import('./uploads.service').UploadCaller) => Promise<void>;
let removeCurrentImage: (caller: import('./uploads.service').UploadCaller, kind: import('@samou-go/shared-types').UploadKind, resourceId?: string) => Promise<void>;

const CUSTOMER = { userId: 'u-customer', role: UserRole.CUSTOMER } as const;
const ADMIN = { userId: 'u-admin', role: UserRole.ADMIN } as const;
const MANAGER = { userId: 'u-manager', role: UserRole.STORE_MANAGER } as const;
const OTHER_MANAGER = { userId: 'u-other', role: UserRole.STORE_MANAGER } as const;

function ReadableFrom(data: Buffer): Readable {
  return Readable.from([data]);
}

async function makePng(width = 12, height = 8): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 189, b: 129 },
    },
  })
    .png()
    .toBuffer();
}

async function expectHttpError(
  promise: Promise<unknown>,
  code: string,
  status: number
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).code).toBe(code);
    expect((error as HttpError).statusCode).toBe(status);
    return;
  }
  expect.fail(`Expected ${code} to be thrown`);
}

beforeAll(async () => {
  ({ sniffImageType } = await import('./image'));
  ({ storage } = await import('./storage'));
  ({ finalizeUpload, presign, storeRaw, removeUpload, removeCurrentImage } = await import('./uploads.service'));
  await rm(process.env.UPLOAD_DIR as string, { recursive: true, force: true });
});

beforeEach(async () => {
  await rm(process.env.UPLOAD_DIR as string, { recursive: true, force: true });
  h.state.product = { id: 'p1', storeId: 's1', imageUrl: null };
  h.state.store = { id: 's1', managerId: 'u-manager', logoUrl: null };
  h.state.currentUser = { id: 'u-customer', profileImageUrl: null, profileImageKey: null };
  h.state.userUpdated = null;
  h.state.userRemoved = false;
  vi.clearAllMocks();
});

afterAll(async () => {
  await rm(process.env.UPLOAD_DIR as string, { recursive: true, force: true });
});

describe('sniffImageType', () => {
  it('rejects text', () => {
    expect(sniffImageType(Buffer.from('definitely not an image'))).toBeNull();
  });

  it('detects a real PNG by magic bytes', async () => {
    expect(sniffImageType(await makePng())).toBe('image/png');
  });
});

describe('presign', () => {
  it('rejects an unsupported content type', async () => {
    await expectHttpError(
      presign(CUSTOMER, { contentType: 'text/html', kind: 'user' }),
      'BAD_REQUEST',
      400
    );
  });

  it('mints a caller-scoped user key with a PUT target', async () => {
    const result = await presign(CUSTOMER, { contentType: 'image/jpeg', kind: 'user' });
    expect(result.key).toMatch(/^user\/u-customer\/[^/]+\.jpg$/);
    expect(result.uploadUrl).toBe(
      `http://localhost:4000/api/v1/uploads/raw/${encodeURIComponent(result.key)}`
    );
    expect(result.maxBytes).toBe(4096);
  });

  it('requires manager access for a product', async () => {
    h.state.product = null as never;
    await expectHttpError(
      presign(MANAGER, { contentType: 'image/png', kind: 'product', resourceId: 'missing' }),
      'NOT_FOUND',
      404
    );

    h.state.product = { id: 'p1', storeId: 's1', imageUrl: null };
    h.state.store.managerId = 'someone-else';
    await expectHttpError(
      presign(MANAGER, { contentType: 'image/png', kind: 'product', resourceId: 'p1' }),
      'FORBIDDEN',
      403
    );

    h.state.store.managerId = 'u-manager';
    const result = await presign(MANAGER, {
      contentType: 'image/png',
      kind: 'product',
      resourceId: 'p1',
    });
    expect(result.key).toMatch(/^product\/p1\/[^/]+\.png$/);
  });

  it('lets an admin presign any product', async () => {
    h.state.store.managerId = 'someone-else';
    const result = await presign(ADMIN, {
      contentType: 'image/webp',
      kind: 'product',
      resourceId: 'p1',
    });
    expect(result.key).toMatch(/^product\/p1\//);
  });
});

describe('presign (store logo)', () => {
  it('requires resourceId and a manager of that store', async () => {
    await expectHttpError(
      presign(MANAGER, { contentType: 'image/png', kind: 'store' }),
      'BAD_REQUEST',
      400
    );

    h.state.store.managerId = 'someone-else';
    await expectHttpError(
      presign(MANAGER, { contentType: 'image/png', kind: 'store', resourceId: 's1' }),
      'FORBIDDEN',
      403
    );

    h.state.store.managerId = 'u-manager';
    const result = await presign(MANAGER, {
      contentType: 'image/png',
      kind: 'store',
      resourceId: 's1',
    });
    expect(result.key).toMatch(/^store\/s1\/[^/]+\.png$/);
  });

  it('lets an admin presign any store logo', async () => {
    h.state.store.managerId = 'someone-else';
    const result = await presign(ADMIN, {
      contentType: 'image/webp',
      kind: 'store',
      resourceId: 's1',
    });
    expect(result.key).toMatch(/^store\/s1\//);
  });
});

describe('storeRaw', () => {
  it('rejects a key that belongs to someone else', async () => {
    const stolen = await presign(CUSTOMER, { contentType: 'image/png', kind: 'user' });
    await expectHttpError(
      storeRaw(stolen.key, ReadableFrom(Buffer.from('x')), OTHER_MANAGER),
      'FORBIDDEN',
      403
    );
  });

  it('enforces the byte ceiling and leaves no partial file', async () => {
    const { key } = await presign(CUSTOMER, { contentType: 'image/png', kind: 'user' });
    await expectHttpError(
      storeRaw(key, ReadableFrom(Buffer.alloc(8192)), CUSTOMER),
      'PAYLOAD_TOO_LARGE',
      413
    );
    expect(await storage.readRaw(key)).toBeNull();
  });
});

describe('finalizeUpload (avatar)', () => {
  it('rejects before the raw file arrives', async () => {
    const { key } = await presign(CUSTOMER, { contentType: 'image/png', kind: 'user' });
    await expectHttpError(finalizeUpload(CUSTOMER, key, 'user'), 'UPLOAD_NOT_READY', 400);
  });

  it('rejects non-image content already on disk', async () => {
    const { key } = await presign(CUSTOMER, { contentType: 'image/png', kind: 'user' });
    await storeRaw(key, ReadableFrom(Buffer.from('not an image at all')), CUSTOMER);
    await expectHttpError(finalizeUpload(CUSTOMER, key, 'user'), 'BAD_REQUEST', 400);
  });

  it('processes, stores a WebP, records the URL and clears the raw file', async () => {
    const { key } = await presign(CUSTOMER, { contentType: 'image/png', kind: 'user' });
    await storeRaw(key, ReadableFrom(await makePng()), CUSTOMER);

    const result = await finalizeUpload(CUSTOMER, key, 'user');

    expect(result.url).toMatch(/^http:\/\/localhost:4000\/uploads\/user\/u-customer\/[^/]+\.webp$/);
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
    expect(h.state.userUpdated).toEqual({
      profileImageUrl: result.url,
      profileImageKey: key,
    });

    const finalPath = path.join(
      process.env.UPLOAD_DIR as string,
      'final',
      result.url.split('/uploads/')[1] as string
    );
    const onDisk = await readFile(finalPath);
    expect(onDisk.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(await storage.readRaw(key)).toBeNull();
  });

  it('forbids finalizing a user key owned by someone else', async () => {
    const { key } = await presign(MANAGER, { contentType: 'image/png', kind: 'user' });
    await storeRaw(key, ReadableFrom(await makePng()), MANAGER);
    await expectHttpError(finalizeUpload(OTHER_MANAGER, key, 'user'), 'FORBIDDEN', 403);
  });
});

describe('removeUpload (avatar)', () => {
  it('clears the profile fields and deletes the processed file', async () => {
    const { key } = await presign(CUSTOMER, { contentType: 'image/png', kind: 'user' });
    await storeRaw(key, ReadableFrom(await makePng()), CUSTOMER);
    await finalizeUpload(CUSTOMER, key, 'user');

    await removeUpload(key, CUSTOMER);

    expect(h.state.userRemoved).toBe(true);
    const finalPath = path.join(
      process.env.UPLOAD_DIR as string,
      'final',
      (h.state.userUpdated?.profileImageUrl as string).split('/uploads/')[1] as string
    );
    await expect(readFile(finalPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('removeCurrentImage', () => {
  it('detaches the caller avatar from its URL alone', async () => {
    const { key } = await presign(CUSTOMER, { contentType: 'image/png', kind: 'user' });
    await storeRaw(key, ReadableFrom(await makePng()), CUSTOMER);
    const { url } = await finalizeUpload(CUSTOMER, key, 'user');

    await removeCurrentImage(CUSTOMER, 'user');

    expect(h.state.currentUser?.profileImageUrl).toBeNull();
    const finalPath = path.join(
      process.env.UPLOAD_DIR as string,
      'final',
      url.split('/uploads/')[1] as string
    );
    await expect(readFile(finalPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes a managed product image by resourceId', async () => {
    const { key } = await presign(MANAGER, {
      contentType: 'image/png',
      kind: 'product',
      resourceId: 'p1',
    });
    await storeRaw(key, ReadableFrom(await makePng()), MANAGER);
    await finalizeUpload(MANAGER, key, 'product');

    await removeCurrentImage(MANAGER, 'product', 'p1');

    expect(h.state.product?.imageUrl).toBeNull();
    const base = process.env.UPLOAD_DIR as string;
    for (const name of ['sm', 'md', 'lg']) {
      await expect(readFile(path.join(base, 'final', `product/p1/${name}.webp`))).rejects.toMatchObject(
        { code: 'ENOENT' }
      );
    }
  });
});

describe('product images', () => {
  it('writes three variants and attaches the md URL', async () => {
    const { key } = await presign(MANAGER, {
      contentType: 'image/png',
      kind: 'product',
      resourceId: 'p1',
    });
    await storeRaw(key, ReadableFrom(await makePng()), MANAGER);

    const result = await finalizeUpload(MANAGER, key, 'product');

    expect(result.url).toMatch(/\/uploads\/product\/p1\/[^/]+\/md\.webp$/);
    expect(h.state.product?.imageUrl).toBe(result.url);
    expect(result.width).toBe(800);
    expect(result.height).toBe(800);

    const mdPath = path.join(
      process.env.UPLOAD_DIR as string,
      'final',
      result.url.split('/uploads/')[1] as string
    );
    expect(await readFile(mdPath)).toBeDefined();
    expect(await storage.readRaw(key)).toBeNull();
  });

  it('removes every variant when the manager deletes the image', async () => {
    const { key } = await presign(MANAGER, {
      contentType: 'image/png',
      kind: 'product',
      resourceId: 'p1',
    });
    await storeRaw(key, ReadableFrom(await makePng()), MANAGER);
    await finalizeUpload(MANAGER, key, 'product');

    await removeUpload(key, MANAGER);

    expect(h.state.product?.imageUrl).toBeNull();
    const base = process.env.UPLOAD_DIR as string;
    for (const name of ['sm', 'md', 'lg']) {
      await expect(readFile(path.join(base, 'final', `product/p1/${name}.webp`))).rejects.toMatchObject(
        { code: 'ENOENT' }
      );
    }
  });
});

describe('store logos', () => {
  it('finalizes a square WebP and attaches the URL to the store', async () => {
    const { key } = await presign(MANAGER, {
      contentType: 'image/png',
      kind: 'store',
      resourceId: 's1',
    });
    await storeRaw(key, ReadableFrom(await makePng()), MANAGER);

    const result = await finalizeUpload(MANAGER, key, 'store');

    expect(result.url).toMatch(/^http:\/\/localhost:4000\/uploads\/store\/s1\/[^/]+\.webp$/);
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
    expect(h.state.store?.logoUrl).toBe(result.url);

    const onDisk = await readFile(
      path.join(
        process.env.UPLOAD_DIR as string,
        'final',
        result.url.split('/uploads/')[1] as string
      )
    );
    expect(onDisk.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(await storage.readRaw(key)).toBeNull();
  });

  it('forbids a non-manager from finalizing a store logo', async () => {
    const { key } = await presign(MANAGER, {
      contentType: 'image/png',
      kind: 'store',
      resourceId: 's1',
    });
    await storeRaw(key, ReadableFrom(await makePng()), MANAGER);
    await expectHttpError(finalizeUpload(OTHER_MANAGER, key, 'store'), 'FORBIDDEN', 403);
  });

  it('detaches the logo from its URL alone', async () => {
    const { key } = await presign(MANAGER, {
      contentType: 'image/png',
      kind: 'store',
      resourceId: 's1',
    });
    await storeRaw(key, ReadableFrom(await makePng()), MANAGER);
    const { url } = await finalizeUpload(MANAGER, key, 'store');

    await removeCurrentImage(MANAGER, 'store', 's1');

    expect(h.state.store?.logoUrl).toBeNull();
    await expect(
      readFile(
        path.join(
          process.env.UPLOAD_DIR as string,
          'final',
          url.split('/uploads/')[1] as string
        )
      )
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('clears the logo and deletes files via removeUpload', async () => {
    const { key } = await presign(MANAGER, {
      contentType: 'image/png',
      kind: 'store',
      resourceId: 's1',
    });
    await storeRaw(key, ReadableFrom(await makePng()), MANAGER);
    const { url } = await finalizeUpload(MANAGER, key, 'store');

    await removeUpload(key, MANAGER);

    expect(h.state.store?.logoUrl).toBeNull();
    await expect(
      readFile(
        path.join(
          process.env.UPLOAD_DIR as string,
          'final',
          url.split('/uploads/')[1] as string
        )
      )
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});