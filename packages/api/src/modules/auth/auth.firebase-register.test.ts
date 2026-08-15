import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpError } from '../../lib/http-error';
import { firebaseRegister } from './auth.service';

/**
 * Unit tests for POST /auth/firebase-register.
 *
 * Firebase Phone Auth replaces the server-side OTP round-trip: the ID token is
 * the proof of ownership. These tests pin the security posture — the phone is
 * taken from the token's `phone_number` claim (never trusted from the body),
 * cross-checked against the submitted phone, and only then an account is
 * created (`isVerified: true`) or, for a returning customer, signed in.
 */

interface TokenClaims {
  phone_number?: string;
}

const h = vi.hoisted(() => {
  const state = {
    user: null as Record<string, unknown> | null,
    claims: null as TokenClaims | null,
    /** Whether verifyIdToken should reject (invalid/expired token). */
    tokenValid: true,
    createCalls: 0,
  };
  return { state };
});

vi.mock('../../config/env', () => ({
  env: {
    isProduction: false,
    sms: { countryCode: '+970' },
  },
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { phone: string } }) =>
        h.state.user && h.state.user.phone === where.phone ? h.state.user : null
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        h.state.createCalls += 1;
        h.state.user = { id: 'u-1', ...data };
        return h.state.user;
      }),
    },
  },
}));

vi.mock('../../config/firebaseAdmin', () => ({
  verifyFirebaseIdToken: vi.fn(async () => {
    if (!h.state.tokenValid) throw new Error('invalid token');
    return h.state.claims;
  }),
}));

vi.mock('../../lib/jwt', () => ({
  signAccessToken: vi.fn(() => ({ accessToken: 'at-1', expiresIn: 3600 })),
}));
vi.mock('../../lib/password', () => ({ hashPassword: vi.fn(async () => 'pw-hash') }));
vi.mock('./auth.mapper', () => ({
  toPublicUser: vi.fn((u: Record<string, unknown>) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    isActive: u.isActive,
    isVerified: u.isVerified,
  })),
}));
vi.mock('./refresh-token', () => ({
  issueRefreshToken: vi.fn(async () => 'rt-1'),
  revokeAllUserRefreshTokens: vi.fn(async () => {}),
}));

const PHONE = '0599111000';
const E164_PHONE = `+970${PHONE.slice(1)}`;

function seedUser(overrides: Record<string, unknown> = {}): void {
  h.state.user = {
    id: 'u-1',
    name: 'سامي',
    phone: PHONE,
    role: 'CUSTOMER',
    isActive: true,
    isVerified: true,
    ...overrides,
  };
}

beforeEach(() => {
  h.state.user = null;
  h.state.claims = { phone_number: E164_PHONE };
  h.state.tokenValid = true;
  h.state.createCalls = 0;
  vi.clearAllMocks();
});

describe('firebaseRegister — Firebase Phone Auth registration', () => {
  it('creates a verified CUSTOMER from the token phone and returns a session', async () => {
    const result = await firebaseRegister({
      idToken: 'id-token-1',
      name: 'سامي',
      phone: PHONE,
    });

    expect(result.user.phone).toBe(PHONE);
    expect(result.user.isVerified).toBe(true);
    expect(result.user.role).toBe('CUSTOMER');
    expect(result.accessToken).toBe('at-1');
    expect(result.refreshToken).toBe('rt-1');
    expect(h.state.createCalls).toBe(1);
  });

  it('signs an existing active account straight in — no second row', async () => {
    seedUser({ id: 'u-existing' });

    const result = await firebaseRegister({
      idToken: 'id-token-1',
      name: 'سامي',
      phone: PHONE,
    });

    expect(result.user.id).toBe('u-existing');
    expect(h.state.createCalls).toBe(0);
  });

  it('rejects a deactivated account', async () => {
    seedUser({ isActive: false });

    const error = await firebaseRegister({
      idToken: 'id-token-1',
      name: 'سامي',
      phone: PHONE,
    }).catch((e: HttpError) => e);

    expect(error.statusCode).toBe(403);
    expect(error.message).toContain('موقوف');
  });

  it('rejects an invalid or expired ID token', async () => {
    h.state.tokenValid = false;

    const error = await firebaseRegister({
      idToken: 'id-token-bad',
      name: 'سامي',
      phone: PHONE,
    }).catch((e: HttpError) => e);

    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('Firebase');
  });

  it('rejects a token that carries no phone_number claim', async () => {
    h.state.claims = {};

    const error = await firebaseRegister({
      idToken: 'id-token-1',
      name: 'سامي',
      phone: PHONE,
    }).catch((e: HttpError) => e);

    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('FIREBASE_NO_PHONE');
  });

  it('rejects a token whose phone differs from the submitted phone', async () => {
    h.state.claims = { phone_number: '+9705999222333' };

    const error = await firebaseRegister({
      idToken: 'id-token-1',
      name: 'سامي',
      phone: PHONE,
    }).catch((e: HttpError) => e);

    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('FIREBASE_PHONE_MISMATCH');
    expect(h.state.createCalls).toBe(0);
  });

  it('rejects a non-Palestinian token phone', async () => {
    h.state.claims = { phone_number: '+966555555555' };

    const error = await firebaseRegister({
      idToken: 'id-token-1',
      name: 'سامي',
      phone: PHONE,
    }).catch((e: HttpError) => e);

    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('FIREBASE_PHONE_MISMATCH');
  });
});