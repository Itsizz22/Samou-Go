import path from 'node:path';
import { env } from '../config/env';

export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export const ALLOWED_AUDIO_MIMES = ['audio/webm', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/mpeg'] as const;
export type AllowedAudioMime = (typeof ALLOWED_AUDIO_MIMES)[number];

export const ALL_ALLOWED_MIMES = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_AUDIO_MIMES] as const;
export type AllowedMime = (typeof ALL_ALLOWED_MIMES)[number];

export const MIME_TO_EXT: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
};

/** Max audio upload size: 4 MB. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/** Square avatar target — profile images are always a 256×256 cover crop. */
export const AVATAR_SIZE = 256;

/** Product variants, name → longest edge in pixels. `md` is the canonical URL. */
export const PRODUCT_SIZES = { sm: 160, md: 400, lg: 800 } as const;
export type ProductVariant = keyof typeof PRODUCT_SIZES;

/** Offer banner — wide landscape crop at 800 × 450 (16:9). */
export const OFFER_SIZE = { width: 800, height: 450 } as const;

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
