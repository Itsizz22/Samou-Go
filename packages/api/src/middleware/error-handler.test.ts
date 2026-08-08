import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errorHandler } from './error-handler';
import { HttpError, conflict, notFound, unprocessable } from '../lib/http-error';

/**
 * The error envelope is the contract every failure must honour: `success: false`
 * with a machine-readable `error.code`, a bilingual safe `error.message` and
 * optional field `details`. It must NEVER leak stack traces, raw Prisma/SQL
 * text or internal identifiers to the client.
 */

const h = vi.hoisted(() => ({ env: { isProduction: false } }));

vi.mock('../config/env', () => ({ env: h.env }));

function makeRes() {
  const res = {
    headersSent: false,
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  res.setHeader = vi.fn((name: string, value: string) => {
    res.headers[name] = value;
    return res;
  });
  return res;
}

const req = { method: 'POST', originalUrl: '/api/v1/auth/login' } as Request;

function run(error: unknown) {
  const res = makeRes();
  const next = vi.fn();
  errorHandler(error, req, res as unknown as Response, next as unknown as NextFunction);
  return { res, next };
}

describe('error envelope', () => {
  it('renders an HttpError as a structured failure', () => {
    const { res } = run(unprocessable('VOUCHER_EXPIRED', 'كوبون منتهي الصلاحية / Voucher expired'));

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'VOUCHER_EXPIRED', message: 'كوبون منتهي الصلاحية / Voucher expired' },
    });
  });

  it('includes field details when the error carries them', () => {
    const err = new HttpError(422, 'VALIDATION_ERROR', 'بيانات غير صالحة', [
      { path: 'phone', message: 'Invalid phone' },
    ]);
    const { res } = run(err);

    expect((res.body as { error: { details: unknown } }).error.details).toEqual([
      { path: 'phone', message: 'Invalid phone' },
    ]);
  });

  it('never emits a stack trace in production', () => {
    h.env.isProduction = true;
    const { res } = run(new Error('boom: the secret internal message'));

    expect(res.statusCode).toBe(500);
    const error = (res.body as { error: Record<string, unknown> }).error;
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toContain('boom');
    h.env.isProduction = false;
  });

  it('includes a stack only outside production (local debugging)', () => {
    h.env.isProduction = false;
    const { res } = run(new Error('local debug'));

    const error = (res.body as { error: Record<string, unknown> }).error;
    expect(Array.isArray(error.stack)).toBe(true);
  });

  it('treats a random thrown value as an opaque 500', () => {
    const { res } = run('some random string thrown by a buggy handler');
    expect(res.statusCode).toBe(500);
    expect((res.body as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
  });

  it('maps body-parser JSON errors (entity.parse.failed) to 400 INVALID_JSON', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected token in JSON'), {
      statusCode: 400,
      status: 400,
      expose: true,
      type: 'entity.parse.failed',
    });
    const { res } = run(parseError);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_JSON');
  });

  it('forwards to next() when headers were already sent', () => {
    const res = makeRes();
    res.headersSent = true;
    const next = vi.fn();
    const boom = new Error('too late');
    errorHandler(boom, req, res as unknown as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('no database internals leak', () => {
  it('maps a unique-constraint violation to a generic 409, never the SQL text', () => {
    const raw = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the `users.phone` field', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target: ['users_phone_key'] },
    });
    const { res } = run(raw);

    expect(res.statusCode).toBe(409);
    const error = (res.body as { error: { code: string; message: string } }).error;
    expect(error.code).toBe('DUPLICATE_VALUE');
    expect(JSON.stringify(res.body)).not.toContain('Unique constraint failed');
    expect(JSON.stringify(res.body)).not.toContain('Prisma');
    expect(JSON.stringify(res.body)).not.toContain('6.19.3');
  });

  it('maps a missing-record error to a clean 404', () => {
    const raw = new Prisma.PrismaClientKnownRequestError('An operation failed because it depends on one or more records', {
      code: 'P2025',
      clientVersion: '6.19.3',
      meta: { modelName: 'Order', cause: 'Record to update not found.' },
    });
    const { res } = run(raw);

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(res.body)).not.toContain('Order');
    expect(JSON.stringify(res.body)).not.toContain('Record to update');
  });

  it('maps a malformed-query error to an opaque 400', () => {
    h.env.isProduction = true;
    const raw = new Prisma.PrismaClientValidationError('Argument `email` is missing.', {
      clientVersion: '6.19.3',
    });
    const { res } = run(raw);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('PRISMA_VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('Argument');
    expect(JSON.stringify(res.body)).not.toContain('email');
    h.env.isProduction = false;
  });

  it('surfaces unknown Prisma codes with a generic message, never the raw meta', () => {
    h.env.isProduction = true;
    const raw = new Prisma.PrismaClientKnownRequestError('A raw server message', {
      code: 'P2020',
      clientVersion: '6.19.3',
      meta: { database: 'secret-db-name' },
    });
    const { res } = run(raw);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('PRISMA_P2020');
    expect(JSON.stringify(res.body)).not.toContain('secret-db-name');
    expect(JSON.stringify(res.body)).not.toContain('A raw server message');
    h.env.isProduction = false;
  });
});

describe('zod failures', () => {
  it('renders a ZodError as a 422 with per-field details', () => {
    const result = z
      .object({ phone: z.string().min(5), password: z.string().min(1) })
      .safeParse({ phone: 'a', password: '' });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');

    const { res } = run(result.error);

    expect(res.statusCode).toBe(422);
    const error = (res.body as { error: { code: string; details: { path: string }[] } }).error;
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.map(d => d.path)).toEqual(expect.arrayContaining(['phone', 'password']));
  });
});

describe('429 retry hint', () => {
  it('sets Retry-After when the error carries retryAfterSeconds', () => {
    const err = new HttpError(429, 'TOO_MANY_REQUESTS', 'Slow down');
    (err as HttpError & { retryAfterSeconds?: number }).retryAfterSeconds = 120;
    const { res } = run(err);

    expect(res.headers['Retry-After']).toBe('120');
  });

  it('does not set Retry-After on other statuses', () => {
    const { res } = run(conflict('Already there'));
    expect(res.headers['Retry-After']).toBeUndefined();
  });
});
