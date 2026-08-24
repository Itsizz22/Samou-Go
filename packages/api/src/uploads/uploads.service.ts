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

const KEY_PATTERN = /^(user|product|store|offer|category)\/([^/]+)\/([^/]+)\.(jpg|png|webp)$/;

export interface UploadCaller {
  userId: string;
  role: UserRole;
}

interface ParsedKey {
  kind: UploadKind;
  ownerId: string;
  /**
   * `store` keys only — which store image slot the upload targets. Cover keys
   * carry a `cover-` filename marker (`store/<id>/cover-<uuid>.jpg`); logo keys
   * keep the plain shape so pre-cover uploads and tests stay valid.
   */
  purpose: 'logo' | 'cover' | 'image';
}

function parseKey(key: string): ParsedKey | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  const filename = match[3] as string;
  return {
    kind: match[1] as UploadKind,
    ownerId: match[2] as string,
    purpose: filename.startsWith('cover-') ? 'cover' : (match[1] === 'category' ? 'image' : 'logo'),
  };
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
): Promise<{ id: string; managerId: string; logoUrl: string | null; coverUrl: string | null }> {
  const store = await prisma.store.findUnique({
    where: { id: ownerId },
    select: { id: true, managerId: true, logoUrl: true, coverUrl: true },
  });
  if (!store) throw notFound('المتجر غير موجود / Store not found');
  if (caller.role === UserRole.ADMIN) return store;
  if (store.managerId !== caller.userId) throw forbidden();
  return store;
}

/**
 * An offer key is only usable by the offer's store manager (or an admin) —
 * the same ownership rule as products and stores. Resolves the offer so
 * callers can act on the loaded row instead of re-querying.
 */
async function resolveOffer(
  ownerId: string,
  caller: UploadCaller
): Promise<{ id: string; storeId: string; imageUrl: string | null; imageKey: string | null }> {
  const offer = await prisma.offer.findUnique({
    where: { id: ownerId },
    select: { id: true, storeId: true, imageUrl: true, imageKey: true },
  });
  if (!offer) throw notFound('العرض غير موجود / Offer not found');
  if (caller.role === UserRole.ADMIN) return offer;

  const store = await prisma.store.findUnique({
    where: { id: offer.storeId },
    select: { managerId: true },
  });
  if (!store || store.managerId !== caller.userId) throw forbidden();
  return offer;
}

/**
 * A category key is only usable by the category's store manager (or an admin).
 * Resolves the category so callers can act on the loaded row instead of re-querying.
 */
async function resolveCategory(
  ownerId: string,
  caller: UploadCaller
): Promise<{ id: string; storeId: string; imageUrl: string | null }> {
  const category = await prisma.category.findUnique({
    where: { id: ownerId },
    select: { id: true, storeId: true, imageUrl: true },
  });
  if (!category) throw notFound('القسم غير موجود / Category not found');
  if (caller.role === UserRole.ADMIN) return category;

  const store = await prisma.store.findUnique({
    where: { id: category.storeId },
    select: { managerId: true },
  });
  if (!store || store.managerId !== caller.userId) throw forbidden();
  return category;
}

export async function presign(
  caller: UploadCaller,
  input: { contentType: string; kind: UploadKind; resourceId?: string; purpose?: 'logo' | 'cover' | 'image' }
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
        'resourceId مطلوب لصور المتجر / resourceId is required for store images'
      );
    }
    await resolveStore(input.resourceId, caller);
    // Cover uploads get a `cover-` filename marker so every later step
    // (raw PUT, finalize, remove) can tell which store slot the key targets
    // without trusting a caller-supplied field.
    const marker = input.purpose === 'cover' ? 'cover-' : '';
    key = `store/${input.resourceId}/${marker}${randomUUID()}.${ext}`;
  } else if (input.kind === 'offer') {
    if (!input.resourceId) {
      throw badRequest(
        'resourceId مطلوب لصور العروض / resourceId is required for offer images'
      );
    }
    await resolveOffer(input.resourceId, caller);
    key = `offer/${input.resourceId}/${randomUUID()}.${ext}`;
  } else if (input.kind === 'category') {
    if (!input.resourceId) {
      throw badRequest(
        'resourceId مطلوب لصور الأقسام / resourceId is required for category images'
      );
    }
    await resolveCategory(input.resourceId, caller);
    key = `category/${input.resourceId}/${randomUUID()}.${ext}`;
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
  } else if (parsed.kind === 'offer') {
    await resolveOffer(parsed.ownerId, caller);
  } else if (parsed.kind === 'category') {
    await resolveCategory(parsed.ownerId, caller);
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
  const offer = parsed.kind === 'offer' ? await resolveOffer(parsed.ownerId, caller) : null;
  const category = parsed.kind === 'category' ? await resolveCategory(parsed.ownerId, caller) : null;
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

  if (parsed.kind === 'user' || parsed.kind === 'store' || parsed.kind === 'offer' || parsed.kind === 'category') {
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
      } else if (parsed.kind === 'offer') {
        await prisma.offer.update({
          where: { id: offer!.id },
          data: { imageUrl: url, imageKey: key },
        });
      } else if (parsed.kind === 'category') {
        await prisma.category.update({
          where: { id: category!.id },
          data: { imageUrl: url },
        });
      } else if (parsed.purpose === 'cover') {
        await prisma.store.update({
          where: { id: store!.id },
          data: { coverUrl: url },
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
 * caller's own avatar, or (with `resourceId`) to a product or store they
 * manage. `purpose` picks the store slot ('logo' | 'cover'); product/user
 * calls ignore it. The client never has to remember an opaque key for this;
 * the URL it already holds is enough to locate the processed files.
 */
export async function removeCurrentImage(
  caller: UploadCaller,
  kind: UploadKind,
  resourceId?: string,
  purpose?: 'logo' | 'cover' | 'image'
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
        'resourceId مطلوب لصور المتجر / resourceId is required for store images'
      );
    }
    const store = await resolveStore(resourceId, caller);
    const field = purpose === 'cover' ? store.coverUrl : store.logoUrl;
    if (!field) return;

    const finalKey = keyFromPublicUrl(field);
    if (finalKey) await storage.removeFinal(finalKey).catch(() => undefined);

    await prisma.store.update({
      where: { id: store.id },
      data: purpose === 'cover' ? { coverUrl: null } : { logoUrl: null },
    });
    return;
  }

  if (kind === 'offer') {
    if (!resourceId) {
      throw badRequest(
        'resourceId مطلوب لصور العروض / resourceId is required for offer images'
      );
    }
    const offer = await resolveOffer(resourceId, caller);
    if (!offer.imageUrl) return;

    const finalKey = keyFromPublicUrl(offer.imageUrl);
    if (finalKey) await storage.removeFinal(finalKey).catch(() => undefined);
    if (offer.imageKey) await storage.removeRaw(offer.imageKey).catch(() => undefined);

    await prisma.offer.update({
      where: { id: offer.id },
      data: { imageUrl: null, imageKey: null },
    });
    return;
  }

  if (kind === 'category') {
    if (!resourceId) {
      throw badRequest(
        'resourceId مطلوب لصور الأقسام / resourceId is required for category images'
      );
    }
    const cat = await resolveCategory(resourceId, caller);
    if (!cat.imageUrl) return;

    const finalKey = keyFromPublicUrl(cat.imageUrl);
    if (finalKey) await storage.removeFinal(finalKey).catch(() => undefined);

    await prisma.category.update({
      where: { id: cat.id },
      data: { imageUrl: null },
    });
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
    if (parsed.purpose === 'cover') {
      if (store.coverUrl === url) {
        await prisma.store.update({ where: { id: store.id }, data: { coverUrl: null } });
      }
    } else if (store.logoUrl === url) {
      await prisma.store.update({ where: { id: store.id }, data: { logoUrl: null } });
    }
    await storage.removeRaw(key).catch(() => undefined);
    await storage.removeFinal(`${base}.webp`).catch(() => undefined);
    return;
  }

  if (parsed.kind === 'offer') {
    const offer = await resolveOffer(parsed.ownerId, caller);
    const url = storage.finalUrl(`${base}.webp`);
    if (offer.imageUrl === url) {
      await prisma.offer.update({
        where: { id: offer.id },
        data: { imageUrl: null, imageKey: null },
      });
    }
    await storage.removeRaw(key).catch(() => undefined);
    await storage.removeFinal(`${base}.webp`).catch(() => undefined);
    return;
  }

  if (parsed.kind === 'category') {
    const cat = await resolveCategory(parsed.ownerId, caller);
    const url = storage.finalUrl(`${base}.webp`);
    if (cat.imageUrl === url) {
      await prisma.category.update({
        where: { id: cat.id },
        data: { imageUrl: null },
      });
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