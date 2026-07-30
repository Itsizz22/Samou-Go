import cors from 'cors';
import express from 'express';
import type { Application, Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { ok } from './lib/respond';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { apiRouter } from './routes';

export const API_PREFIX = '/api/v1';

export function createApp(): Application {
  const app = express();

  // Behind nginx on the production box, so req.ip / secure cookies stay honest.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin, curl, and native mobile clients send no Origin header.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        callback(new Error(`الأصل غير مسموح / Origin not allowed: ${origin}`));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

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
