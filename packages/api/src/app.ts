import { databaseReady } from './lib/readiness';
import path from 'node:path';
import { storage } from './uploads/storage';
import { asyncHandler } from './lib/async-handler';
import cors from 'cors';
import express from 'express';
import type { Application, Request, Response } from 'express';
import fs from 'node:fs';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOptions } from './config/cors';
import { env } from './config/env';
import { ok } from './lib/respond';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { apiRouter } from './routes';
import { uploadDirs } from './uploads/uploads.config';

export const API_PREFIX = '/api/v1';

export function createApp(): Application {
  const app = express();

  // Behind nginx on the production box, so req.ip / secure cookies stay honest.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());

  // Origin allow-list, methods and headers live in `config/cors.ts`.
  app.use(cors(corsOptions));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Ensure the uploads directories exist on disk — on fresh deploys (Render,
  // Fly.io, etc.) the directories may not exist yet, and express.static would
  // throw or return 503 when a client requests an upload URL.
  for (const dir of [uploadDirs.rawDir, uploadDirs.finalDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Processed uploads are immutable — every URL embeds a fresh random key, so a
  // year-long immutable cache is safe. CORP must be cross-origin because the
  // seven frontends live on other ports and load these images from here.
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(uploadDirs.finalDir, {
      maxAge: '365d',
      immutable: true,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    })
  );
  // Recover immutable processed media after a deployment discards the disk cache.
  app.use('/uploads', asyncHandler(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { next(); return; }
    const key = req.path.slice(1);
    if (!/^[a-zA-Z0-9_/-]+\.(webp|png|jpe?g|avif|gif|webm|mp4|m4a|ogg)$/i.test(key)) { next(); return; }
    const data = await storage.readFinal(key);
    if (!data) { next(); return; }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(path.extname(key)).send(data);
  }));
  // Missing image files can outlive their database URL after storage loss.
  // Render a visible placeholder without caching it, so restored files appear immediately.
  app.use('/uploads', (req: Request, res: Response) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && /\.(webp|png|jpe?g|avif|gif)$/i.test(req.path)) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Image-Fallback', 'missing-upload');
      res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect width="320" height="240" fill="#f1f5f9"/><g fill="none" stroke="#94a3b8" stroke-width="5" stroke-linejoin="round"><rect x="110" y="65" width="100" height="80" rx="10"/><circle cx="180" cy="88" r="9"/><path d="m115 137 28-30 25 23 17-16 20 23"/></g><text x="160" y="181" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#64748b">الصورة غير متاحة</text></svg>');
      return;
    }
    res.status(404).json({ message: 'File not found' });
  });

  if (!env.isTest) {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  /** Liveness probe — no database round-trip, so it stays up during an outage. */
  app.get('/health', (_req: Request, res: Response) => {
    ok(res, { status: 'ok', service: 'samou-go-api', environment: env.nodeEnv });
  });

  app.get('/ready', asyncHandler(async (_req, res) => {
    const ready = await databaseReady();
    res.setHeader('Cache-Control', 'no-store');
    res.status(ready ? 200 : 503).json({ success: ready, data: { status: ready ? 'ready' : 'unavailable' } });
  }));

  app.use(API_PREFIX, apiRouter);

  // Order matters: 404 first, then the error funnel.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
