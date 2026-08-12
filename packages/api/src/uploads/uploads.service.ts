import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type {
  FinalizeUploadResult,
  PresignUploadResult,
  UploadKind,
} from '@samou-go/shared-types';
import { UserRole } from '@samou-go/shared-types';
import { badRequest, badState, forbidden, notFound } from '../lib/http-error';
import { prisma } from '../lib/prisma';
import { processImage, sniffImageType } from './image';
import { storage } from './storage';
import { ALLOWED_IMAGE_MIMES, MIME_TO_EXT, uploadConfig } from './uploads.config';

const KEY_PATTERN = /^(user|product|store)\/([^/]+)\/([^/]+)\.(jpg|png|webp)$/;

export interface UploadCaller {
  userId: string;
  role: UserRole;
}

interface ParsedKey {
  kind: UploadKind;
  ownerId: string;
}

function parseKey(key: string): ParsedKey | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  return { kind: match[1] as UploadKind, ownerId: match[2] as string };
}

function baseKeyOf(rawKey: string): string {
  const dot = rawKey.lastIndexOf('.');
  return dot === -1 ? rawKey : rawKey.slice(0, dot);
}

function assertUserKey(key: string, caller: UploadCaller): void {
  if (!key.startsWith(`user/${caller.userId}/`)) {
    throw forbidden();
  }
}

/**
 * A product key is only usable by the store's manager (or an admin). Resolves
 * the product so callers can act on the loaded row instead of re-querying.
 */
async function resolveProduct(
  ownerId: string,
  caller: UploadCaller
): Promise<{ id: string; storeId: string; imageUrl: string | null }> {
  const product = await prisma.product.findUnique({ where: { id: ownerId } });
  if (!product) throw notFound('المنتج غير موجود / Product not found');
  if (caller.role === UserRole.ADMIN) return product;

  const store = await prisma.store.findUnique({
    where: { id: product.storeId },
    select: { managerId: true },
  });
  if (!store || store.managerId !== caller.userId) throw forbidden();
  return product;
}

/**
 * A store key is only usable by the store's manager (or an admin). Resolves
 * the store so callers can act on the loaded row instead of re-querying.
 */
async function resolveStore(
  ownerId: string,
  caller: UploadCaller
): Promise<{ id: string; managerId: string; logoUrl: string | null }> {
  const store = await prisma.store.findUnique({
    where: { id: ownerId },
    select: { id: true, managerId: true, logoUrl: true },
  });
  if (!store) throw notFound('المتجر غير موجود / Store not found');
  if (caller.role === UserRole.ADMIN) return store;
  if (store.managerId !== caller.userId) throw forbidden();
  return store;
}

export async function presign(
  caller: UploadCaller,
  input: { contentType: string; kind: UploadKind; resourceId?: string }
): Promise<PresignUploadResult> {
  const mime = ALLOWED_IMAGE_MIMES.find(entry => entry === input.contentType);
  if (!mime) {
    throw badRequest(
      'نوع الصورة غير مدعوم — يُسمح بـ JPEG أو PNG أو WebP / Unsupported image type — JPEG, PNG or WebP only'
    );
  }

  const ext = MIME_TO_EXT[mime];
  let key: string;

  if (input.kind === 'user') {
    key = `user/${caller.userId}/${randomUUID()}.${ext}`;
  } else if (input.kind === 'product') {
    if (!input.resourceId) {
      throw badRequest(
        'resourceId مطلوب لصور المنتجات / resourceId is required for product images'
      );
    }
    await resolveProduct(input.resourceId, caller);
    key = `product/${input.resourceId}/${randomUUID()}.${ext}`;
  } else if (input.kind === 'store') {
    if (!input.resourceId) {
      throw badRequest(
        'resourceId مطلوب لشعار المتجر / resourceId is required for store logos'
      );
    }
    await resolveStore(input.resourceId, caller);
    key = `store/${input.resourceId}/${randomUUID()}.${ext}`;
  } else {
    throw badRequest('نوع رفع غير معروف / Unknown upload kind');
  }

  return {
    uploadUrl: storage.rawUploadUrl(key),
    key,
    contentType: mime,
    maxBytes: uploadConfig.maxBytes,
  };
}

/** PUT /uploads/raw/:key — stream the raw bytes into storage. */
export async function storeRaw(key: string, body: Readable, caller: UploadCaller): Promise<void> {
  const parsed = parseKey(key);
  if (!parsed) throw badRequest('مفتاح رفع غير صالح / Invalid upload key');

  if (parsed.kind === 'user') {
    assertUserKey(key, caller);
  } else if (parsed.kind === 'product') {
    await resolveProduct(parsed.ownerId, caller);
  } else {
    await resolveStore(parsed.ownerId, caller);
  }

  await storage.streamRaw(key, body);
}

/** POST /uploads/finalize — validate, process and attach the image. */
export async function finalizeUpload(
  caller: UploadCaller,
  key: string,
  kind: UploadKind
): Promise<FinalizeUploadResult> {
  const parsed = parseKey(key);
  if (!parsed || parsed.kind !== kind) {
    throw badRequest('مفتاح رفع غير صالح / Invalid upload key');
  }

  const product = parsed.kind === 'product' ? await resolveProduct(parsed.ownerId, caller) : null;
  const store = parsed.kind === 'store' ? await resolveStore(parsed.ownerId, caller) : null;
  if (parsed.kind === 'user') assertUserKey(key, caller);

  const raw = await storage.readRaw(key);
  if (!raw) {
    throw badState(
      'UPLOAD_NOT_READY',
      'لم تُرفع الملفات بعد، أعد المحاولة / File has not been uploaded yet'
    );
  }
  if (!sniffImageType(raw)) {
    throw badRequest('الملف ليس صورة صالحة / File is not a valid image');
  }

  const base = baseKeyOf(key);
  const processed = await processImage({ buffer: raw, kind });

  if (parsed.kind === 'user' || parsed.kind === 'store') {
    const variant = processed.variants[0]!;
    const finalKey = `${base}.webp`;
    const url = storage.finalUrl(finalKey);
    await storage.writeFinal(finalKey, variant.buffer);

    try {
      if (parsed.kind === 'user') {
        await prisma.user.update({
          where: { id: caller.userId },
          data: { profileImageUrl: url, profileImageKey: key },
        });
      } else {
        await prisma.store.update({
          where: { id: store!.id },
          data: { logoUrl: url },
        });
      }
    } catch (error) {
      await storage.removeFinal(finalKey).catch(() => undefined);
      throw error;
    }

    await storage.removeRaw(key).catch(() => undefined);
    return { url, width: variant.width, height: variant.height };
  }

  const written = new Map<string, string>();
  try {
    for (const variant of processed.variants) {
      const finalKey = `${base}/${variant.name}.webp`;
      await storage.writeFinal(finalKey, variant.buffer);
      written.set(variant.name, finalKey);
    }
  } catch (error) {
    for (const finalKey of written.values()) {
      await storage.removeFinal(finalKey).catch(() => undefined);
    }
    throw error;
  }

  const mdUrl = storage.finalUrl(written.get('md') as string);
  const lg = processed.variants.find(variant => variant.name === 'lg');
  try {
    await prisma.product.update({ where: { id: product!.id }, data: { imageUrl: mdUrl } });
  } catch (error) {
    for (const finalKey of written.values()) {
      await storage.removeFinal(finalKey).catch(() => undefined);
    }
    throw error;
  }

  await storage.removeRaw(key).catch(() => undefined);
  return {
    url: mdUrl,
    width: lg ? lg.width : processed.variants[0]!.width,
    height: lg ? lg.height : processed.variants[0]!.height,
  };
}

/** The object key embedded in a public URL like `<origin>/uploads/<key>`. */
function keyFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = '/uploads/';
  const index = url.lastIndexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length);
}

/**
 * DELETE /uploads/current — removes the image currently attached to the
 * caller's own avatar, or (with `resourceId`) to a product they manage.
 * The client never has to remember an opaque key for this; the URL it already
 * holds is enough to locate the processed files.
 */
export async function removeCurrentImage(
  caller: UploadCaller,
  kind: UploadKind,
  resourceId?: string
): Promise<void> {
  if (kind === 'user') {
    const user = await prisma.user.findUnique({
      where: { id: caller.userId },
      select: { id: true, profileImageUrl: true, profileImageKey: true },
    });
    if (!user) throw notFound('المستخدم غير موجود / User not found');
    if (!user.profileImageUrl) return;

    const finalKey = keyFromPublicUrl(user.profileImageUrl);
    if (finalKey) await storage.removeFinal(finalKey).catch(() => undefined);
    if (user.profileImageKey) await storage.removeRaw(user.profileImageKey).catch(() => undefined);

    await prisma.user.update({
      where: { id: caller.userId },
      data: { profileImageUrl: null, profileImageKey: null },
    });
    return;
  }

  if (kind === 'store') {
    if (!resourceId) {
      throw badRequest(
        'resourceId مطلوب لشعار المتجر / resourceId is required for store logos'
      );
    }
    const store = await resolveStore(resourceId, caller);
    if (!store.logoUrl) return;

    const finalKey = keyFromPublicUrl(store.logoUrl);
    if (finalKey) await storage.removeFinal(finalKey).catch(() => undefined);

    await prisma.store.update({ where: { id: store.id }, data: { logoUrl: null } });
    return;
  }

  if (!resourceId) {
    throw badRequest(
      'resourceId مطلوب لصور المنتجات / resourceId is required for product images'
    );
  }
  const product = await resolveProduct(resourceId, caller);
  if (!product.imageUrl) return;

  const base = keyFromPublicUrl(product.imageUrl);
  if (base) {
    for (const name of ['sm', 'md', 'lg']) {
      await storage.removeFinal(`${base}/${name}.webp`).catch(() => undefined);
    }
  }
  await prisma.product.update({ where: { id: product.id }, data: { imageUrl: null } });
}

/** DELETE /uploads/raw/:key — detach and remove the image (raw + processed). */
export async function removeUpload(key: string, caller: UploadCaller): Promise<void> {
  const parsed = parseKey(key);
  if (!parsed) throw badRequest('مفتاح رفع غير صالح / Invalid upload key');
  const base = baseKeyOf(key);

  if (parsed.kind === 'user') {
    assertUserKey(key, caller);
    await prisma.user.updateMany({
      where: { id: caller.userId, profileImageKey: key },
      data: { profileImageUrl: null, profileImageKey: null },
    });
    await storage.removeRaw(key).catch(() => undefined);
    await storage.removeFinal(`${base}.webp`).catch(() => undefined);
    return;
  }

  if (parsed.kind === 'store') {
    const store = await resolveStore(parsed.ownerId, caller);
    const url = storage.finalUrl(`${base}.webp`);
    if (store.logoUrl === url) {
      await prisma.store.update({ where: { id: store.id }, data: { logoUrl: null } });
    }
    await storage.removeRaw(key).catch(() => undefined);
    await storage.removeFinal(`${base}.webp`).catch(() => undefined);
    return;
  }

  const product = await resolveProduct(parsed.ownerId, caller);
  const mdUrl = storage.finalUrl(`${base}/md.webp`);
  if (product.imageUrl === mdUrl) {
    await prisma.product.update({ where: { id: product.id }, data: { imageUrl: null } });
  }
  await storage.removeRaw(key).catch(() => undefined);
  for (const name of ['sm', 'md', 'lg']) {
    await storage.removeFinal(`${base}/${name}.webp`).catch(() => undefined);
  }
}