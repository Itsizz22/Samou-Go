import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { badRequest, payloadTooLarge } from '../lib/http-error';
import { uploadConfig, uploadDirs } from './uploads.config';

/**
 * Where an upload actually lives. The local adapter writes to
 * `packages/api/.uploads/{raw,final}`; an S3 adapter replaces the read/write
 * methods and the URL builders, leaving the rest of the module untouched.
 */
export interface StorageAdapter {
  /** Stream the request body into raw storage, aborting past `maxBytes`. */
  streamRaw(rawKey: string, body: Readable): Promise<void>;
  readRaw(rawKey: string): Promise<Buffer | null>;
  writeFinal(finalKey: string, data: Buffer): Promise<void>;
  removeRaw(rawKey: string): Promise<void>;
  removeFinal(finalKey: string): Promise<void>;
  /** Absolute public URL the browser can load the processed file from. */
  finalUrl(finalKey: string): string;
  /** PUT target the caller streams raw bytes to (server route or S3 presign). */
  rawUploadUrl(rawKey: string): string;
}

/**
 * Rejects any key that would escape the uploads root. Keys are server-generated
 * (`user/<id>/<uuid>.jpg`), but DELETE takes a caller-supplied key, so this is
 * the only defence against path traversal — do not drop it.
 */
function resolveWithin(root: string, key: string): string {
  const rootResolved = path.resolve(root);
  const target = path.resolve(rootResolved, key);
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) {
    throw badRequest('مسار رفع غير صالح / Invalid upload path');
  }
  return target;
}

export class LocalStorageAdapter implements StorageAdapter {
  async streamRaw(rawKey: string, body: Readable): Promise<void> {
    const target = resolveWithin(uploadDirs.rawDir, rawKey);
    await mkdir(path.dirname(target), { recursive: true });

    let received = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > uploadConfig.maxBytes) {
          callback(payloadTooLarge());
          return;
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(body, counter, createWriteStream(target));
    } catch (error) {
      await rm(target, { force: true });
      throw error;
    }
  }

  async readRaw(rawKey: string): Promise<Buffer | null> {
    try {
      return await readFile(resolveWithin(uploadDirs.rawDir, rawKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async writeFinal(finalKey: string, data: Buffer): Promise<void> {
    const target = resolveWithin(uploadDirs.finalDir, finalKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async removeRaw(rawKey: string): Promise<void> {
    await rm(resolveWithin(uploadDirs.rawDir, rawKey), { force: true });
  }

  async removeFinal(finalKey: string): Promise<void> {
    await rm(resolveWithin(uploadDirs.finalDir, finalKey), { force: true });
  }

  finalUrl(finalKey: string): string {
    return `${uploadConfig.publicOrigin}/uploads/${finalKey.split(path.sep).join('/')}`;
  }

  rawUploadUrl(rawKey: string): string {
    return `${uploadConfig.publicOrigin}/api/v1/uploads/raw/${encodeURIComponent(rawKey)}`;
  }
}

export const storage: StorageAdapter = new LocalStorageAdapter();