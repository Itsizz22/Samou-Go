import sharp from 'sharp';
import { badRequest } from '../lib/http-error';
import { AVATAR_SIZE, PRODUCT_SIZES, WEBP_QUALITY } from './uploads.config';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_SIGNATURE = Buffer.from('RIFF');

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * MIME detection from file content, not the client's content-type header.
 * A webp file opens with the four bytes `RIFF`; `WEBP` must follow at offset 8.
 */
export function sniffImageType(buffer: Buffer): ImageMime | null {
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(RIFF_SIGNATURE) &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (buffer.length >= JPEG_SIGNATURE.length && buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }
  return null;
}

export interface ImageVariant {
  name: 'avatar' | 'sm' | 'md' | 'lg';
  width: number;
  height: number;
  buffer: Buffer;
}

export interface ProcessedImage {
  variants: ImageVariant[];
}

/**
 * Decode → auto-rotate from EXIF → cover-crop → WebP. Re-encoding to WebP
 * without `.withMetadata()` also strips EXIF/IPTC, which would otherwise leak
 * GPS coordinates and camera make/model into the public file.
 */
export async function processImage(input: {
  buffer: Buffer;
  kind: 'user' | 'product' | 'store';
}): Promise<ProcessedImage> {
  const targets: Array<{ name: ImageVariant['name']; size: number }> =
    input.kind === 'product'
      ? [
          { name: 'sm', size: PRODUCT_SIZES.sm },
          { name: 'md', size: PRODUCT_SIZES.md },
          { name: 'lg', size: PRODUCT_SIZES.lg },
        ]
      : [{ name: 'avatar', size: AVATAR_SIZE }];

  try {
    const variants: ImageVariant[] = [];
    for (const target of targets) {
      const { data, info } = await sharp(input.buffer)
        .rotate()
        .resize(target.size, target.size, {
          fit: 'contain',
          position: 'centre',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      variants.push({
        name: target.name,
        width: info.width,
        height: info.height,
        buffer: data,
      });
    }
    return { variants };
  } catch {
    throw badRequest('ملف صورة غير صالح / Invalid image file');
  }
}
