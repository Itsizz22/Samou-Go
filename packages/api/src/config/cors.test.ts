import { describe, expect, it, vi } from 'vitest';

/**
 * The CORS allow-list is a deployment fact: getting it wrong takes all seven
 * SPAs offline at once (browser-side, with nothing in the server logs), so the
 * policy is unit-tested away from the Express stack.
 */

const h = vi.hoisted(() => ({
  env: { corsOrigins: ['http://192.168.0.100:5173'] as string[] },
}));

vi.mock('./env', () => ({ env: h.env }));

import {
  ALLOWED_METHODS,
  LOCAL_DEV_ORIGINS,
  PRODUCTION_ORIGINS,
  VERCEL_PREVIEW_PATTERN,
  corsOptions,
  isAllowedOrigin,
} from './cors';

/** Drives `corsOptions.origin` the way the `cors` package does. */
function askPolicy(origin: string | undefined): { allowed: boolean; error: Error | null } {
  let allowed = false;
  let error: Error | null = null;
  const originFn = corsOptions.origin as (
    origin: string | undefined,
    cb: (err: Error | null, allow?: boolean) => void
  ) => void;
  originFn(origin, (err, allow) => {
    error = err ?? null;
    allowed = allow === true;
  });
  return { allowed, error };
}

describe('production origins', () => {
  it('allows all seven Vercel production deployments', () => {
    expect(PRODUCTION_ORIGINS).toHaveLength(7);
    for (const origin of PRODUCTION_ORIGINS) {
      expect(isAllowedOrigin(origin)).toBe(true);
    }
  });

  it('covers every app named in the deploy workflow', () => {
    for (const app of [
      'customer',
      'checkout',
      'store-details',
      'order-tracking',
      'store-manager',
      'captain',
      'admin',
    ]) {
      expect(isAllowedOrigin(`https://samou-go-${app}.vercel.app`)).toBe(true);
    }
  });
});

describe('local development', () => {
  it('allows the seven Vite dev ports', () => {
    expect(LOCAL_DEV_ORIGINS).toHaveLength(7);
    for (const origin of LOCAL_DEV_ORIGINS) {
      expect(isAllowedOrigin(origin)).toBe(true);
    }
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
  });

  it('still honours extra origins from CORS_ORIGINS', () => {
    expect(isAllowedOrigin('http://192.168.0.100:5173')).toBe(true);
  });
});

describe('Vercel preview deployments', () => {
  it('allows branch and per-commit preview URLs', () => {
    expect(isAllowedOrigin('https://samou-go-customer-git-feat-x-acme.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://samou-go-admin-abc123def.vercel.app')).toBe(true);
  });

  it('requires https and a bare *.vercel.app host', () => {
    expect(VERCEL_PREVIEW_PATTERN.test('http://samou-go-customer.vercel.app')).toBe(false);
    expect(VERCEL_PREVIEW_PATTERN.test('https://samou-go.vercel.app.evil.com')).toBe(false);
    expect(VERCEL_PREVIEW_PATTERN.test('https://deep.nested.vercel.app')).toBe(false);
  });
});

describe('rejections', () => {
  it('refuses an unknown origin as a 403 HttpError, not a 500', () => {
    const { allowed, error } = askPolicy('https://evil.example.com');
    expect(allowed).toBe(false);
    expect(error).toBeInstanceOf(Error);
    expect((error as unknown as { statusCode: number }).statusCode).toBe(403);
  });

  it('allows a missing Origin (curl, same-origin, Capacitor native)', () => {
    const { allowed, error } = askPolicy(undefined);
    expect(allowed).toBe(true);
    expect(error).toBeNull();
  });
});

describe('policy shape', () => {
  it('sends credentials and every verb the SPAs use', () => {
    expect(corsOptions.credentials).toBe(true);
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(ALLOWED_METHODS).toContain(method);
    }
  });

  it('allows Last-Event-ID so the SSE stream can resume', () => {
    expect(corsOptions.allowedHeaders).toContain('Last-Event-ID');
    expect(corsOptions.allowedHeaders).toContain('Authorization');
  });

  it('allows ngrok-skip-browser-warning so tunnel preflights succeed', () => {
    expect(corsOptions.allowedHeaders).toContain('ngrok-skip-browser-warning');
  });

  it('treats `*` in CORS_ORIGINS as the wildcard escape hatch', () => {
    h.env.corsOrigins = ['*'];
    expect(isAllowedOrigin('https://anything.example.com')).toBe(true);
    h.env.corsOrigins = ['http://192.168.0.100:5173'];
  });
});
