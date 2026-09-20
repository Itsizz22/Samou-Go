import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { badRequest, payloadTooLarge, serviceUnavailable } from '../lib/http-error';
import { uploadConfig, uploadDirs, MAX_AUDIO_BYTES, MAX_VIDEO_BYTES } from './uploads.config';

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
  readFinal(finalKey: string): Promise<Buffer | null>;
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
        if (received > (rawKey.startsWith('video/') ? MAX_VIDEO_BYTES : rawKey.startsWith('audio/') ? MAX_AUDIO_BYTES : uploadConfig.maxBytes)) {
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
    // Static readers must never observe a partially written image/video.
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, data);
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async readFinal(finalKey: string): Promise<Buffer | null> {
    try { return await readFile(resolveWithin(uploadDirs.finalDir, finalKey)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
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

/** Production writes must reach durable storage before an upload can be finalized. */
export class PersistentStorageAdapter extends LocalStorageAdapter {
  private readonly pendingReads = new Map<string, Promise<Buffer | null>>();
  // Bound cold-cache database/blob pressure; identical requests share one read.
  private readonly maxConcurrentRestores = 4;
  private activeRestores = 0;
  private readonly waitingRestores: Array<() => void> = [];
  override async writeFinal(finalKey: string, data: Buffer): Promise<void> {
    resolveWithin(uploadDirs.finalDir, finalKey);
    await prisma.storedUpload.upsert({
      where: { key: finalKey },
      create: { key: finalKey, content: new Uint8Array(data) },
      update: { content: new Uint8Array(data) },
    });
    // A full/unavailable local cache must not discard an otherwise durable upload.
    await super.writeFinal(finalKey, data).catch(() => undefined);
  }

  override async readFinal(finalKey: string): Promise<Buffer | null> {
    resolveWithin(uploadDirs.finalDir, finalKey);
    const pending = this.pendingReads.get(finalKey);
    if (pending) return pending;
    if (this.pendingReads.size >= this.maxConcurrentRestores + 32) {
      throw serviceUnavailable('MEDIA_BUSY', 'الصور قيد التحميل، يرجى المحاولة بعد قليل / Media temporarily busy, please retry shortly');
    }
    const read = this.restoreFinal(finalKey);
    this.pendingReads.set(finalKey, read);
    try { return await read; }
    finally { this.pendingReads.delete(finalKey); }
  }

  private async restoreFinal(finalKey: string): Promise<Buffer | null> {
    if (this.activeRestores >= this.maxConcurrentRestores) {
      await new Promise<void>(resolve => { this.waitingRestores.push(resolve); });
    } else {
      this.activeRestores++;
    }
    try {
      const stored = await prisma.storedUpload.findUnique({ where: { key: finalKey } });
      if (!stored) return null;
      const data = Buffer.from(stored.content);
      await super.writeFinal(finalKey, data).catch(() => undefined);
      return data;
    } finally {
      const next = this.waitingRestores.shift();
      if (next) next();
      else this.activeRestores--;
    }
  }

  override async removeFinal(finalKey: string): Promise<void> {
    resolveWithin(uploadDirs.finalDir, finalKey);
    // An already-running restore must finish before removing its cached copy.
    await this.pendingReads.get(finalKey)?.catch(() => undefined);
    await super.removeFinal(finalKey);
    await prisma.storedUpload.deleteMany({ where: { key: finalKey } });
  }
}

export const storage: StorageAdapter = env.isProduction
  ? new PersistentStorageAdapter()
  : new LocalStorageAdapter();
