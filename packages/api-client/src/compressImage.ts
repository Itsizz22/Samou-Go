/**
 * Samou' Go — client-side image compression.
 *
 * Resizes and compresses images before upload using the Canvas API.
 * No new dependencies required — uses the browser's built-in canvas.
 *
 * Rules:
 *   - Max dimension (width or height): 1600px (photos from modern phones are 4000+)
 *   - Output format: JPEG at quality 0.82 (good balance of size vs quality)
 *   - Transparency is flattened to white background (JPEG doesn't support alpha)
 *   - Files under the threshold are returned as-is to avoid re-encoding artifacts
 *   - Returns a Blob suitable for the existing presign → PUT upload pipeline
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
/** Files smaller than this are already efficient — skip compression. */
const SKIP_COMPRESS_THRESHOLD_BYTES = 512 * 1024; // 512 KB

export async function compressImage(
  file: File | Blob,
  options?: { maxDimension?: number; quality?: number },
): Promise<Blob> {
  const maxDim = options?.maxDimension ?? MAX_DIMENSION;
  const quality = options?.quality ?? JPEG_QUALITY;

  // Skip compression for small files.
  if (file.size <= SKIP_COMPRESS_THRESHOLD_BYTES) return file;

  // Only compress raster images — pass through everything else.
  const type = file.type || '';
  if (!type.startsWith('image/')) return file;

  // GIF and SVG are not compressible via canvas — return as-is.
  if (type === 'image/gif' || type === 'image/svg+xml') return file;

  const bitmap = await createImageBitmap(file);

  // If the image is already within limits and is JPEG, skip.
  if (bitmap.width <= maxDim && bitmap.height <= maxDim && type === 'image/jpeg') {
    bitmap.close();
    return file;
  }

  // Compute the new dimensions maintaining aspect ratio.
  let width = bitmap.width;
  let height = bitmap.height;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file; // Canvas unavailable — return original.
  }

  // Fill white background (flatten alpha for JPEG).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const compressed = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality,
  });

  // Only return the compressed version if it's actually smaller.
  return compressed.size < file.size ? compressed : file;
}
