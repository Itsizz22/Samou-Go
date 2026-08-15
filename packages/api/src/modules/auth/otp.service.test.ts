import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@samou-go/shared-types';
import type { HttpError } from '../../lib/http-error';
import { revokeAllUserRefreshTokens } from './refresh-token';
import {
  adminVerifyCaptainOtp,
  adminVerifyStoreOtp,
  requestOtp,
  resetPassword,
  verifyOtp,
} from './otp.service';

/**
 * Unit tests for the OTP module.
 *
 * The three verify flows (customer sign-in, store provisioning, captain
 * provisioning) share one hardened verifier (`verifyOtpCode`): existence,
 * expiry, attempt budget, then a bcrypt compare. These tests pin that shared
 * behaviour — including the exact bilingual error each flow surfaces — so a
 * future edit to one flow cannot silently change another's security posture.
 */

interface OtpRecord {
  phone: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  requests: number;
  windowStartsAt: Date;
}

const h = vi.hoisted(() => {
  const state = {
    otp: null as OtpRecord | null,
    user: null as Record<string, unknown> | null,
    store: null as Record<string, unknown> | null,
    /** bcrypt.compare result — drives every wrong-vs-correct code test. */
    compareResult: true,
  };
  const gateway = { send: vi.fn(async () => {}) };
  return { state, gateway };
});

vi.mock('bcryptjs', () => {
  const hash = vi.fn(async (code: string) => `hash:${code}`);
  const compare = vi.fn(async () => h.state.compareResult);
  return { hash, compare, default: { hash, compare } };
});

// `config/env` throws at load without a JWT_SECRET — same pattern as the other
// API suites. `otp.service` reads `env.otp` for length, TTL, rate limits.
vi.mock('../../config/env', () => ({
  env: {
    isProduction: false,
    deliveryFeeConfig: { baseFee: 0, bulkFee: 0, bulkThreshold: 5, currency: 'ILS' },
    sms: { provider: 'console', countryCode: '+970' },
    otp: { length: 6, ttlMs: 180_000, rateMax: 3, rateWindowMs: 300_000, maxAttempts: 5 },
  },
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    otpRequest: {
      findUnique: vi.fn(async ({ where }: any) =>
        h.state.otp && h.state.otp.phone === where.phone ? h.state.otp : null
      ),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        if (!h.state.otp || h.state.otp.phone !== where.phone) {
          h.state.otp = { ...create };
          return h.state.otp;
        }
        h.state.otp.codeHash = update.codeHash;
        h.state.otp.expiresAt = update.expiresAt;
        h.state.otp.attempts = 0;
        if (update.requests && typeof update.requests === 'object') {
          h.state.otp.requests += (update.requests as { increment: number }).increment;
        } else if (typeof update.requests === 'number') {
          h.state.otp.requests = update.requests;
          if (update.windowStartsAt) h.state.otp.windowStartsAt = update.windowStartsAt;
        }
        return h.state.otp;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        if (data?.attempts?.increment) h.state.otp!.attempts += 1;
        return h.state.otp;
      }),
      delete: vi.fn(async () => {
        h.state.otp = null;
        return {};
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where }: any) =>
        h.state.user && h.state.user.phone === where.phone ? h.state.user : null
      ),
      create: vi.fn(async ({ data }: any) => {
        h.state.user = { id: 'u-1', ...data };
        return h.state.user;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        h.state.user = { ...h.state.user, id: where.id, ...data };
        return h.state.user;
      }),
    },
    store: {
      create: vi.fn(async ({ data }: any) => {
        h.state.store = { id: 's-1', ...data };
        return h.state.store;
      }),
      findUnique: vi.fn(async ({ where }: any) =>
        h.state.store && h.state.store.id === where.id ? h.state.store : null
      ),
    },
  },
}));

vi.mock('../../lib/jwt', () => ({
  // `signAccessToken` is synchronous in the real module (never awaited) —
  // an async mock would destructure to `undefined` at every call site.
  signAccessToken: vi.fn(() => ({ accessToken: 'at-1', expiresIn: 3600 })),
}));
vi.mock('../../lib/password', () => ({ hashPassword: vi.fn(async () => 'pw-hash') }));
vi.mock('../../lib/sms/gateway', () => ({
  getSmsGateway: vi.fn(() => ({ send: h.gateway.send, provider: 'console' })),
}));
vi.mock('./auth.mapper', () => ({
  toPublicUser: vi.fn((u: Record<string, unknown>) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
  })),
}));
vi.mock('./refresh-token', () => ({
  issueRefreshToken: vi.fn(async () => 'rt-1'),
  revokeAllUserRefreshTokens: vi.fn(async () => {}),
}));

const PHONE = '0599111000';
const CODE = '123456';

function seedOtp(overrides: Partial<OtpRecord> = {}): void {
  h.state.otp = {
    phone: PHONE,
    codeHash: `hash:${CODE}`,
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    requests: 1,
    windowStartsAt: new Date(Date.now() - 10_000),
    ...overrides,
  };
}

beforeEach(() => {
  h.state.otp = null;
  h.state.user = null;
  h.state.store = null;
  h.state.compareResult = true;
  vi.clearAllMocks();
});

describe('requestOtp — dispatch + rate limiting', () => {
  it('dispatches a fresh code for a new phone', async () => {
    const result = await requestOtp({ phone: PHONE });

    // The code itself is `crypto.randomInt` — only its shape is stable.
    expect(h.state.otp?.codeHash).toMatch(/^hash:\d{6}$/);
    expect(h.gateway.send).toHaveBeenCalledTimes(1);
    const [payload] = h.gateway.send.mock.calls[0];
    // Carriers require E.164 — the local `05XXXXXXXX` must arrive as `+970…`.
    expect((payload as { to: string }).to).toBe(`+970${PHONE.slice(1)}`);
    expect((payload as { body: string }).body).toContain('Samou');
    expect(result.dispatched).toBe(false); // console provider never counts as live
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(300);
  });

  it('429s once a phone hits the per-window dispatch budget', async () => {
    seedOtp({ requests: 3 }); // env.otp.rateMax = 3, window 10 s ago

    const promise = requestOtp({ phone: PHONE });

    await expect(promise).rejects.toMatchObject({ statusCode: 429, code: 'OTP_RATE_LIMITED' });
    const reason = (await promise.catch((e: unknown) => e)) as HttpError & {
      retryAfterSeconds?: number;
    };
    expect(reason.message).toContain('Too many requests');
    expect(reason.retryAfterSeconds).toBeGreaterThan(0);
    expect(h.gateway.send).not.toHaveBeenCalled();
  });

  it('rotates the code within the window when under the budget', async () => {
    seedOtp({ requests: 2 });

    const result = await requestOtp({ phone: PHONE });

    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(h.state.otp?.requests).toBe(3);
    expect(h.gateway.send).toHaveBeenCalledTimes(1);
  });

  it('surfaces an SMS carrier failure as a clean 503, never a generic 500', async () => {
    h.gateway.send.mockRejectedValueOnce(new Error('carrier timeout'));

    const promise = requestOtp({ phone: PHONE });

    await expect(promise).rejects.toMatchObject({ statusCode: 503, code: 'SMS_DELIVERY_FAILED' });
    await expect(promise).rejects.toMatchObject({ message: expect.stringContaining("Couldn't send the verification code") });
  });
});

describe('verifyOtp — customer sign-in', () => {
  it('rejects a phone that never requested a code', async () => {
    const promise = verifyOtp({ phone: PHONE, code: CODE });

    await expect(promise).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    await expect(promise).rejects.toMatchObject({ message: 'رمز غير صحيح / Incorrect code' });
  });

  it('rejects an expired code and deletes the row', async () => {
    seedOtp({ expiresAt: new Date(Date.now() - 1_000) });

    await expect(verifyOtp({ phone: PHONE, code: CODE })).rejects.toMatchObject({
      message: 'انتهت صلاحية الرمز، اطلب رمزاً جديداً / Code expired — request a new one',
    });
    expect(h.state.otp).toBeNull();
  });

  it('rejects a code whose attempt budget is spent and deletes the row', async () => {
    seedOtp({ attempts: 5 }); // env.otp.maxAttempts = 5

    await expect(verifyOtp({ phone: PHONE, code: CODE })).rejects.toMatchObject({
      message: 'انتهت صلاحية الرمز، اطلب رمزاً جديداً / Code expired — request a new one',
    });
    expect(h.state.otp).toBeNull();
  });

  it('rejects a wrong code and increments the attempt counter', async () => {
    seedOtp();
    h.state.compareResult = false;

    const promise = verifyOtp({ phone: PHONE, code: '000000' });

    await expect(promise).rejects.toMatchObject({ message: 'رمز غير صحيح / Incorrect code' });
    expect(h.state.otp?.attempts).toBe(1);
    expect(h.state.otp).not.toBeNull(); // still tryable within the budget
  });

  it('signs in an existing customer, marks them verified and consumes the code', async () => {
    seedOtp();
    h.state.user = { id: 'u-1', phone: PHONE, name: 'ليلى', role: UserRole.CUSTOMER, isActive: true };

    const result = await verifyOtp({ phone: PHONE, code: CODE, name: 'ليلى' });

    expect(result.accessToken).toBe('at-1');
    expect(result.refreshToken).toBe('rt-1');
    expect(result.user.phone).toBe(PHONE);
    expect(h.state.user?.isVerified).toBe(true); // OTP proof flips the flag
    expect(h.state.otp).toBeNull(); // one-time use
  });

  it('provisions a brand-new customer already verified before consuming the code', async () => {
    seedOtp();

    const result = await verifyOtp({ phone: PHONE, code: CODE, name: 'مجد' });

    expect(result.user.name).toBe('مجد');
    expect(h.state.user?.role).toBe(UserRole.CUSTOMER);
    expect(h.state.user?.isVerified).toBe(true); // created verified by definition
    expect(h.state.otp).toBeNull();
  });
});

describe('resetPassword', () => {
  it('refuses to provision a missing account', async () => {
    const promise = resetPassword({ phone: PHONE, code: CODE, password: 'new-pass-123' });

    await expect(promise).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('verifies, rotates the password and revokes all sessions', async () => {
    seedOtp();
    h.state.user = { id: 'u-1', phone: PHONE, role: UserRole.CUSTOMER, isActive: true };

    await resetPassword({ phone: PHONE, code: CODE, password: 'new-pass-123' });

    expect(h.state.otp).toBeNull();
    expect(revokeAllUserRefreshTokens).toHaveBeenCalledWith('u-1');
  });
});

describe('adminVerifyStoreOtp — store provisioning', () => {
  it('rejects a non-store account type', async () => {
    await expect(
      adminVerifyStoreOtp({ phone: PHONE, code: CODE, accountType: 'captain' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a phone with no OTP request', async () => {
    await expect(
      adminVerifyStoreOtp({ phone: PHONE, code: CODE, accountType: 'store' })
    ).rejects.toMatchObject({
      message: 'لا يوجد طلب رمز للرقم هذا / No OTP request for this phone',
    });
  });

  it('rejects an expired code with the store-specific wording and deletes the row', async () => {
    seedOtp({ expiresAt: new Date(Date.now() - 1_000) });

    await expect(
      adminVerifyStoreOtp({ phone: PHONE, code: CODE, accountType: 'store' })
    ).rejects.toMatchObject({
      message: 'انتهت صلاحية الرمز، اطلب رمزاً جديداً / Code expired — request a new one',
    });
    expect(h.state.otp).toBeNull();
  });

  it('rejects an exhausted attempt budget with the store-specific wording', async () => {
    seedOtp({ attempts: 5 });

    await expect(
      adminVerifyStoreOtp({ phone: PHONE, code: CODE, accountType: 'store' })
    ).rejects.toMatchObject({ message: 'تم تجاوزlimit المحاولات / Maximum attempts exceeded' });
  });

  it('rejects a wrong code and increments the attempt counter', async () => {
    seedOtp();
    h.state.compareResult = false;

    await expect(
      adminVerifyStoreOtp({ phone: PHONE, code: '000000', accountType: 'store' })
    ).rejects.toMatchObject({ message: 'رمز خاطئ / Incorrect code' });
    expect(h.state.otp?.attempts).toBe(1);
  });

  it('provisions the store manager + store and consumes the code', async () => {
    seedOtp();

    const result = await adminVerifyStoreOtp({
      phone: PHONE,
      code: CODE,
      accountType: 'store',
      storeData: { nameAr: 'بقالة السموع', nameEn: 'Samou Grocery' },
    });

    expect(result.accessToken).toBe('at-1');
    expect(h.state.user?.role).toBe(UserRole.STORE_MANAGER);
    expect(h.state.store?.managerId).toBe('u-1');
    expect(h.state.store?.isApproved).toBe(true);
    expect(h.state.otp).toBeNull();
  });
});

describe('adminVerifyCaptainOtp — captain provisioning', () => {
  it('rejects an expired code with the captain-specific wording and deletes the row', async () => {
    seedOtp({ expiresAt: new Date(Date.now() - 1_000) });

    await expect(
      adminVerifyCaptainOtp({ phone: PHONE, code: CODE, accountType: 'captain' })
    ).rejects.toMatchObject({
      message: 'انتهت صلاحية الرمز، اطلب رمزاً جديداً / Code expired — request a new one',
    });
    expect(h.state.otp).toBeNull();
  });

  it('rejects a valid code when the assigned store does not exist', async () => {
    seedOtp();

    await expect(
      adminVerifyCaptainOtp({
        phone: PHONE,
        code: CODE,
        accountType: 'captain',
        captainData: { nameAr: 'كرم', assignedStoreId: 'missing-store' },
      })
    ).rejects.toMatchObject({ message: 'المتجر غير موجود / Store not found' });
  });

  it('provisions the captain and consumes the code', async () => {
    seedOtp();
    h.state.store = { id: 's-1', nameAr: 'بقالة السموع', managerId: 'u-9' };

    const result = await adminVerifyCaptainOtp({
      phone: PHONE,
      code: CODE,
      accountType: 'captain',
      captainData: { nameAr: 'كرم', assignedStoreId: 's-1' },
    });

    expect(result.accessToken).toBe('at-1');
    expect(h.state.user?.role).toBe(UserRole.CAPTAIN);
    expect(h.state.user?.assignedStoreId).toBe('s-1');
    expect(h.state.otp).toBeNull();
  });
});
