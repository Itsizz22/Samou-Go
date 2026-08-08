import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@samou-go/shared-types';
import { authenticate, authorize, optionalAuthenticate, requireAuth } from './authenticate';
import { signAccessToken } from '../lib/jwt';
import { HttpError } from '../lib/http-error';

/**
 * Unit tests for the two authentication gates: `authenticate` (401 unless a
 * valid bearer token is present) and `authorize` (403 unless the role from the
 * VERIFIED token is on the allow-list). Identity is read only from the JWT
 * claims — a request can never self-declare a role.
 */

const h = vi.hoisted(() => ({
  secret: 'unit-test-secret-that-is-at-least-32-characters-long',
  wrongSecret: 'a-completely-different-secret-for-forged-tokens-!!',
}));

vi.mock('../config/env', () => ({
  env: {
    nodeEnv: 'test',
    isProduction: false,
    isTest: true,
    port: 4000,
    databaseUrl: 'postgres://test@localhost:5432/test',
    jwt: { secret: h.secret, expiresIn: '1h', refreshExpiresIn: '30d' },
    sms: { provider: 'none', generic: {}, twilio: {}, firebase: {} },
    otp: { length: 6, ttlMs: 180000, rateMax: 3, rateWindowMs: 300000, maxAttempts: 5 },
    corsOrigins: ['http://localhost:5173'],
    deliveryFeeConfig: { baseFee: 3, bulkFee: 5, bulkThreshold: 5, currency: 'ILS' },
  },
}));

function makeRequest(headers: Record<string, unknown> = {}): Request {
  return { headers: { authorization: undefined, ...headers } } as unknown as Request;
}

function makeNext() {
  return vi.fn((..._args: unknown[]) => {});
}

/** Asserts `next` was invoked with a single HttpError argument. */
function expectHttpError(next: ReturnType<typeof makeNext>, code: string, status: number) {
  const [arg] = next.mock.calls[0] ?? [];
  expect(arg).toBeInstanceOf(HttpError);
  const http = arg as HttpError;
  expect(http.code).toBe(code);
  expect(http.statusCode).toBe(status);
}

const customer = signAccessToken({
  userId: 'u-customer',
  role: UserRole.CUSTOMER,
  phone: '0599000001',
}).accessToken;

const admin = signAccessToken({
  userId: 'u-admin',
  role: UserRole.ADMIN,
  phone: '0599000004',
}).accessToken;

describe('authenticate', () => {
  it('rejects requests with no Authorization header (401)', () => {
    const next = makeNext();
    authenticate(makeRequest(), {} as Response, next as unknown as NextFunction);
    expectHttpError(next, 'UNAUTHORIZED', 401);
  });

  it('rejects a non-Bearer scheme (401)', () => {
    const next = makeNext();
    authenticate(makeRequest({ authorization: `Token ${customer}` }), {} as Response, next as unknown as NextFunction);
    expectHttpError(next, 'UNAUTHORIZED', 401);
  });

  it('rejects a garbage / malformed token (401)', () => {
    const next = makeNext();
    authenticate(makeRequest({ authorization: 'Bearer not.a.real.jwt' }), {} as Response, next as unknown as NextFunction);
    expectHttpError(next, 'UNAUTHORIZED', 401);
  });

  it('rejects a token signed with the wrong secret (401)', () => {
    const forged = jwt.sign(
      { role: UserRole.ADMIN, phone: '0599000001' },
      h.wrongSecret,
      { subject: 'u-customer' }
    );
    const next = makeNext();
    authenticate(
      makeRequest({ authorization: `Bearer ${forged}` }),
      {} as Response,
      next as unknown as NextFunction
    );
    expectHttpError(next, 'UNAUTHORIZED', 401);
  });

  it('rejects an expired token (401)', () => {
    const expired = jwt.sign(
      { role: UserRole.CUSTOMER, phone: '0599000001', exp: Math.floor(Date.now() / 1000) - 60 },
      h.secret,
      { subject: 'u-customer' }
    );
    const next = makeNext();
    authenticate(
      makeRequest({ authorization: `Bearer ${expired}` }),
      {} as Response,
      next as unknown as NextFunction
    );
    expectHttpError(next, 'UNAUTHORIZED', 401);
  });

  it('accepts a valid token and attaches the verified claims to req.auth', () => {
    const req = makeRequest({ authorization: `Bearer ${customer}` });
    const next = makeNext();
    authenticate(req, {} as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]![0]).toBeUndefined();
    expect(req.auth).toMatchObject({ sub: 'u-customer', role: UserRole.CUSTOMER, phone: '0599000001' });
  });
});

describe('authorize (role gate)', () => {
  it('403 when no token made it through (should never happen behind authenticate)', () => {
    const next = makeNext();
    authorize(UserRole.ADMIN)(makeRequest(), {} as Response, next as unknown as NextFunction);
    expectHttpError(next, 'UNAUTHORIZED', 401);
  });

  it('403 when the verified role is not on the allow-list', () => {
    const req = { auth: { sub: 'u-customer', role: UserRole.CUSTOMER, phone: '0599000001' } } as Request;
    const next = makeNext();
    authorize(UserRole.ADMIN)(req, {} as Response, next as unknown as NextFunction);
    expectHttpError(next, 'FORBIDDEN', 403);
  });

  it('passes when the verified role is allowed', () => {
    const req = { auth: { sub: 'u-admin', role: UserRole.ADMIN, phone: '0599000004' } } as Request;
    const next = makeNext();
    authorize(UserRole.ADMIN)(req, {} as Response, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]![0]).toBeUndefined();
  });

  it('passes for any authenticated role when no allow-list is given', () => {
    const req = { auth: { sub: 'u-customer', role: UserRole.CUSTOMER, phone: '0599000001' } } as Request;
    const next = makeNext();
    authorize()(req, {} as Response, next as unknown as NextFunction);
    expect(next.mock.calls[0]![0]).toBeUndefined();
  });
});

describe('optionalAuthenticate', () => {
  it('lets an anonymous request through', () => {
    const req = makeRequest();
    const next = makeNext();
    optionalAuthenticate(req, {} as Response, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]![0]).toBeUndefined();
    expect(req.auth).toBeUndefined();
  });

  it('ignores a bad token on a public route', () => {
    const req = makeRequest({ authorization: 'Bearer garbage' });
    const next = makeNext();
    optionalAuthenticate(req, {} as Response, next as unknown as NextFunction);
    expect(next.mock.calls[0]![0]).toBeUndefined();
    expect(req.auth).toBeUndefined();
  });

  it('attaches claims when a valid token is present', () => {
    const req = makeRequest({ authorization: `Bearer ${customer}` });
    const next = makeNext();
    optionalAuthenticate(req, {} as Response, next as unknown as NextFunction);
    expect(req.auth).toMatchObject({ sub: 'u-customer', role: UserRole.CUSTOMER });
  });
});

describe('requireAuth', () => {
  it('throws 401 when called without req.auth', () => {
    expect(() => requireAuth(makeRequest())).toThrowError(HttpError);
    try {
      requireAuth(makeRequest());
    } catch (error) {
      expect((error as HttpError).statusCode).toBe(401);
    }
  });

  it('returns the verified claims when present', () => {
    const req = { auth: { sub: 'u-admin', role: UserRole.ADMIN, phone: '0599000004' } } as Request;
    expect(requireAuth(req)).toMatchObject({ sub: 'u-admin', role: UserRole.ADMIN });
  });
});
