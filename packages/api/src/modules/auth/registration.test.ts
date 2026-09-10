import { beforeEach, expect, it, vi } from 'vitest';
import { UserRole } from '@samou-go/shared-types';
const h = vi.hoisted(() => ({ verify: vi.fn(), create: vi.fn(), find: vi.fn(), token: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { user: { findUnique: h.find, create: h.create } }, caseInsensitiveContains: vi.fn() }));
vi.mock('./otp.service', () => ({ verifyAndConsumeOtp: h.verify }));
vi.mock('../../lib/public-code', () => ({ nextPublicCode: vi.fn(async () => 'CU-10001') }));
vi.mock('../../lib/password', () => ({ hashPassword: vi.fn(async () => 'hash'), verifyPassword: vi.fn() }));
vi.mock('../../lib/jwt', () => ({ signAccessToken: h.token }));
vi.mock('./refresh-token', () => ({ issueRefreshToken: vi.fn(async () => 'refresh'), revokeAllUserRefreshTokens: vi.fn(), rotateRefreshToken: vi.fn() }));
vi.mock('./auth.mapper', () => ({ toPublicUser: (user: unknown) => user }));
import { register } from './auth.service';
import { registerSchema } from './auth.schemas';
const input = { name: 'Test Customer', phone: '0599000008', password: 'test-password' };
beforeEach(() => { vi.resetAllMocks(); h.find.mockResolvedValue(null); h.verify.mockResolvedValue(undefined); h.create.mockResolvedValue({ id: 'u1', phone: input.phone, role: UserRole.CUSTOMER }); h.token.mockReturnValue({ accessToken: 'token', expiresIn: 900 }); });
it('rejects public registration without OTP before user creation or token issuance', async () => {
  await expect(register(input)).rejects.toMatchObject({ code: 'PHONE_VERIFICATION_REQUIRED' });
  expect(h.create).not.toHaveBeenCalled(); expect(h.token).not.toHaveBeenCalled();
});
it('rejects invalid OTP without creating an account', async () => {
  h.verify.mockRejectedValue(new Error('invalid OTP'));
  await expect(register({ ...input, otpCode: '123456' })).rejects.toThrow('invalid OTP');
  expect(h.create).not.toHaveBeenCalled(); expect(h.token).not.toHaveBeenCalled();
});
it('verifies the exact phone and code before issuing a registration session', async () => {
  await expect(register({ ...input, otpCode: '123456' })).resolves.toMatchObject({ accessToken: 'token' });
  expect(h.verify).toHaveBeenCalledWith(input.phone, '123456');
  expect(h.verify.mock.invocationCallOrder[0]).toBeLessThan(h.create.mock.invocationCallOrder[0]!);
  expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isVerified: true }) }));
});
it('preserves authorized admin provisioning', async () => {
  await register(input, UserRole.ADMIN); expect(h.verify).not.toHaveBeenCalled(); expect(h.create).toHaveBeenCalledOnce();
});
it('does not trust a requested admin role as an OTP bypass', async () => {
  await expect(register({ ...input, role: UserRole.ADMIN })).rejects.toThrow(); expect(h.create).not.toHaveBeenCalled();
});
it('rejects malformed codes at the request boundary', () => {
  expect(registerSchema.safeParse({ ...input, otpCode: 'abc123' }).success).toBe(false);
});
