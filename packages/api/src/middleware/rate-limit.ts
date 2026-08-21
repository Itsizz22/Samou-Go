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
  max: env.isDevelopment ? 1000 : 10,
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

/**
 * Applied to the OTP endpoints. Stops a single IP from driving unlimited SMS
 * dispatching across many phone numbers (a spam/billing attack). The stricter
 * per-phone limit (3 per 5 minutes) lives in the OTP service itself, keyed by
 * phone number and enforced against the database so it survives restarts.
 */
export const otpIpLimiter = rateLimit({
  windowMs: 5 * 60 * 1_000, // 5 minutes
  max: env.isDevelopment ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message:
        'طلبات كثيرة جداً، يرجى المحاولة بعد 5 دقائق / Too many requests — try again in 5 minutes',
    },
  } satisfies ApiFailure,
});

/**
 * Applied to `POST /orders` — order creation.
 *
 * A legitimate customer places at most a few orders per session. This
 * prevents script abuse that could flood the kitchen with fake orders.
 */
export const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1_000, // 10 minutes
  max: env.isDevelopment ? 1000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message:
        'لقد أرسلت طلبات كثيرة، يرجى الانتظار قليلاً / You placed too many orders — please wait a moment',
    },
  } satisfies ApiFailure,
});

/**
 * Applied to `POST /orders/quote` — price quoting.
 *
 * The checkout debounces on the client (300 ms), but a script could still
 * hammer this endpoint. Generous limit: a human taps "place order" a few
 * times; 30 quotes in 5 minutes is more than enough.
 */
export const quoteLimiter = rateLimit({
  windowMs: 5 * 60 * 1_000, // 5 minutes
  max: env.isDevelopment ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message:
        'طلبات كثيرة جداً، يرجى المحاولة بعد قليل / Too many requests — please wait a moment',
    },
  } satisfies ApiFailure,
});
