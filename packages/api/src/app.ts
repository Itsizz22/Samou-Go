import cors from 'cors';
import express from 'express';
import type { Application, Request, Response } from 'express';
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

  // Processed uploads are immutable — every URL embeds a fresh random key, so a
  // year-long immutable cache is safe. CORP must be cross-origin because the
  // seven frontends live on other ports and load these images from here.
  app.use(
    '/uploads',
    express.static(uploadDirs.finalDir, {
      maxAge: '365d',
      immutable: true,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    })
  );

  if (!env.isTest) {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  /** Liveness probe — no database round-trip, so it stays up during an outage. */
  app.get('/health', (_req: Request, res: Response) => {
    ok(res, { status: 'ok', service: 'samou-go-api', environment: env.nodeEnv });
  });

  app.use(API_PREFIX, apiRouter);

  // Order matters: 404 first, then the error funnel.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
