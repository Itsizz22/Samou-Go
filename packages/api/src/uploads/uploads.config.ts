import path from 'node:path';
import { env } from '../config/env';

export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export const MIME_TO_EXT: Record<AllowedImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Square avatar target — profile images are always a 256×256 cover crop. */
export const AVATAR_SIZE = 256;

/** Product variants, name → longest edge in pixels. `md` is the canonical URL. */
export const PRODUCT_SIZES = { sm: 160, md: 400, lg: 800 } as const;
export type ProductVariant = keyof typeof PRODUCT_SIZES;

export const WEBP_QUALITY = 82;

/** Resolved against the API cwd — `packages/api/.uploads` when run via npm. */
export const uploadDirs = {
  rawDir: path.resolve(env.uploads.dir, 'raw'),
  finalDir: path.resolve(env.uploads.dir, 'final'),
};

export const uploadConfig = {
  maxBytes: env.uploads.maxBytes,
  publicOrigin: env.publicApiOrigin,
};
