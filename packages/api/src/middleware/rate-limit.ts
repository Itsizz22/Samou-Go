import rateLimit from 'express-rate-limit';
import type { ApiFailure } from '@samou-go/shared-types';
import { env } from '../config/env';

/**
 * Applied to `POST /auth/login` and `POST /auth/register`.
 *
 * Limits each IP to 10 attempts per 15-minute window so automated
 * brute-force attacks cannot cycle through passwords in bulk.
 *
 * Skipped entirely in test mode so the smoke tests are not throttled.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000, // 15 minutes
  max: 10,
  standardHeaders: 'draft-7', // RateLimit-* headers (RFC draft)
  legacyHeaders: false,
  skip: () => env.isTest,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message:
        'طلبات كثيرة جداً، يرجى المحاولة بعد 15 دقيقة / Too many attempts — try again in 15 minutes',
    },
  } satisfies ApiFailure,
  // Store defaults to in-memory. For a multi-instance deployment, swap to
  // a Redis store (ioredis-based `rate-limit-redis`). Single-node for now.
});
