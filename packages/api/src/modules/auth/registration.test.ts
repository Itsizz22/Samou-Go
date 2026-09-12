import { beforeEach, expect, it, vi } from 'vitest';
import { UserRole } from '@samou-go/shared-types';
const h = vi.hoisted(() => ({ verify: vi.fn(), create: vi.fn(), find: vi.fn(), update: vi.fn(), token: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ user: { update: h.update } }), user: { findUnique: h.find, create: h.create, update: h.update } }, caseInsensitiveContains: vi.fn() }));
vi.mock('./otp.service', () => ({ verifyAndConsumeOtp: h.verify }));
vi.mock('../../lib/public-code', () => ({ nextPublicCode: vi.fn(async () => 'CU-10001') }));
vi.mock('../../lib/password', () => ({ hashPassword: vi.fn(async () => 'hash'), verifyPassword: vi.fn() }));
vi.mock('../../lib/jwt', () => ({ signAccessToken: h.token }));
vi.mock('./refresh-token', () => ({ issueRefreshToken: vi.fn(async () => 'refresh'), revokeAllUserRefreshTokens: vi.fn(), rotateRefreshToken: vi.fn() }));
vi.mock('./auth.mapper', () => ({ toPublicUser: (user: unknown) => user }));
import { register, updateProfile } from './auth.service';
import { registerSchema, updateProfileSchema } from './auth.schemas';
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


it('requires a phone-change OTP at the request boundary', () => {
  expect(updateProfileSchema.safeParse({ phone: '0599111111' }).success).toBe(false);
  expect(updateProfileSchema.safeParse({ name: 'Updated name' }).success).toBe(true);
});
it('does not change the account when the new phone code is invalid', async () => {
  h.find.mockResolvedValueOnce({ id: 'u1', phone: input.phone }).mockResolvedValueOnce(null);
  h.verify.mockRejectedValue(new Error('Invalid code'));
  await expect(updateProfile('u1', { phone: '0599111111', otpCode: '000000' })).rejects.toThrow('Invalid code');
  expect(h.update).not.toHaveBeenCalled();
});
it('checks the exact new phone and code before updating the account', async () => {
  h.find.mockResolvedValueOnce({ id: 'u1', phone: input.phone }).mockResolvedValueOnce(null);
  h.update.mockResolvedValue({ id: 'u1', phone: '0599111111' });
  await updateProfile('u1', { phone: '0599111111', otpCode: '123456' });
  expect(h.verify).toHaveBeenCalledWith('0599111111', '123456');
  expect(h.verify.mock.invocationCallOrder[0]).toBeLessThan(h.update.mock.invocationCallOrder[0]!);
});
it('rejects a phone owned by another account without verifying or updating', async () => {
  h.find.mockResolvedValueOnce({ id: 'u1', phone: input.phone }).mockResolvedValueOnce({ id: 'other' });
  await expect(updateProfile('u1', { phone: '0599111111', otpCode: '123456' })).rejects.toMatchObject({ statusCode: 409 });
  expect(h.verify).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
});

it.each([UserRole.CUSTOMER, UserRole.CAPTAIN, UserRole.STORE_MANAGER])('saves WhatsApp independently of login phone for %s', async role => {
  const user = { id: 'u1', phone: input.phone, role, whatsappNumber: null };
  h.find.mockResolvedValue(user); h.update.mockResolvedValue({ ...user, whatsappNumber: '+972599000008' });
  const body = updateProfileSchema.parse({ whatsappNumber: '+972599000008' });
  await updateProfile('u1', body);
  expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' }, data: { whatsappNumber: '+972599000008' } }));
  expect(h.verify).not.toHaveBeenCalled();
});
it.each(['+970599000008', '+972599000008', null])('accepts explicit WhatsApp country code or removal %s', whatsappNumber => {
  expect(updateProfileSchema.parse({ whatsappNumber })).toEqual({ whatsappNumber });
});
it.each(['0599000008', '+971599000008', '+972abc', '+972599000008?text=x'])('rejects ambiguous or malformed WhatsApp contact %s', whatsappNumber => {
  expect(updateProfileSchema.safeParse({ whatsappNumber }).success).toBe(false);
});
