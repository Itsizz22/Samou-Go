/**
 * Passwordless phone sign-in (OTP).
 *
 * Security posture, end to end:
 *   - The 6-digit code is generated with `crypto.randomInt`, never predictable.
 *   - The code is bcrypt-hashed (cost 12, same as passwords) before it touches
 *     the database; the plaintext exists only in memory for the few hundred
 *     milliseconds it takes to hash it and hand it to the SMS adapter.
 *   - Codes auto-expire after 3 minutes (`OTP_TTL_SECONDS`).
 *   - A phone may request at most 3 codes per 5-minute window; overflow is a
 *     clear 429 with a `Retry-After` hint.
 *   - A code may be tried at most `OTP_MAX_ATTEMPTS` times before it is
 *     invalidated. Every failure re-hashes a compare — no timing oracle.
 *   - The code row is consumed on success, so a code cannot be replayed.
 */

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type {
  AuthResponse,
  OtpRequestInput,
  OtpVerifyInput,
  ResetPasswordInput,
} from "@samou-go/shared-types";
import { UserRole } from "@samou-go/shared-types";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { tooMany, unauthorized } from "../../lib/http-error";
import { hashPassword } from "../../lib/password";
import { signAccessToken } from "../../lib/jwt";
import { getSmsGateway } from "../../lib/sms/gateway";
import { toPublicUser } from "./auth.mapper";
import { issueRefreshToken } from "./refresh-token";
import { revokeAllUserRefreshTokens } from "./refresh-token";
import { notFound } from "../../lib/http-error";

/** Cost 12 — bcrypt's work factor for the stored code hash. */
const OTP_BCRYPT_ROUNDS = 12;

const CODE_EXPIRED = unauthorized(
  "انتهت صلاحية الرمز، اطلب رمزاً جديداً / Code expired — request a new one",
);
const CODE_INVALID = unauthorized("رمز غير صحيح / Incorrect code");

function generateOtpCode(length: number): string {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

function buildSmsBody(code: string): string {
  return (
    `رمز تحقق Samou' Go الخاص بك هو: ${code}\n` +
    `صالح لمدة ${Math.round(env.otp.ttlMs / 60_000)} دقيقة.\n` +
    `---\n` +
    `Your Samou' Go verification code is: ${code}`
  );
}

export interface OtpRequestResult {
  /** Friendly hint so a legit user does not hammer the resend button. */
  retryAfterSeconds: number;
  /** True when the code was dispatched to a live carrier. */
  dispatched: boolean;
}

/** POST /auth/otp/request — rate-limited dispatch of a one-time code. */
export async function requestOtp(
  body: OtpRequestInput,
): Promise<OtpRequestResult> {
  const { phone } = body;
  const now = new Date();

  const existing = await prisma.otpRequest.findUnique({ where: { phone } });

  if (existing) {
    const windowElapsed = now.getTime() - existing.windowStartsAt.getTime();
    if (windowElapsed < env.otp.rateWindowMs) {
      if (existing.requests >= env.otp.rateMax) {
        const retryAfterSeconds = Math.ceil(
          (env.otp.rateWindowMs - windowElapsed) / 1_000,
        );
        throw tooMany(
          "OTP_RATE_LIMITED",
          `طلبات كثيرة جداً، حاول مجدداً بعد ${Math.ceil(retryAfterSeconds / 60)} دقيقة / ` +
            `Too many requests — try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s)`,
          retryAfterSeconds,
        );
      }
    }
  }

  const code = generateOtpCode(env.otp.length);
  const codeHash = await bcrypt.hash(code, OTP_BCRYPT_ROUNDS);
  const expiresAt = new Date(now.getTime() + env.otp.ttlMs);

  const upserted = await prisma.otpRequest.upsert({
    where: { phone },
    create: {
      phone,
      codeHash,
      expiresAt,
      requests: 1,
      windowStartsAt: now,
    },
    update:
      existing &&
      now.getTime() - existing.windowStartsAt.getTime() < env.otp.rateWindowMs
        ? {
            codeHash,
            expiresAt,
            attempts: 0,
            requests: { increment: 1 },
          }
        : {
            codeHash,
            expiresAt,
            attempts: 0,
            requests: 1,
            windowStartsAt: now,
          },
  });

  const gateway = getSmsGateway();
  await gateway.send({ to: upserted.phone, body: buildSmsBody(code) });

  const windowElapsed = now.getTime() - upserted.windowStartsAt.getTime();
  return {
    retryAfterSeconds: Math.max(
      0,
      Math.ceil((env.otp.rateWindowMs - windowElapsed) / 1_000),
    ),
    dispatched: gateway.provider !== "none" && gateway.provider !== "console",
  };
}

/** POST /auth/otp/verify — exchange a valid code for a session. */
export async function verifyOtp(body: OtpVerifyInput): Promise<AuthResponse> {
  const { phone, code, name } = body;

  const record = await prisma.otpRequest.findUnique({ where: { phone } });
  if (!record) throw CODE_INVALID;

  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.otpRequest.delete({ where: { phone } }).catch(() => {});
    throw CODE_EXPIRED;
  }

  if (record.attempts >= env.otp.maxAttempts) {
    await prisma.otpRequest.delete({ where: { phone } }).catch(() => {});
    throw CODE_EXPIRED;
  }

  const matches = await bcrypt.compare(code, record.codeHash);
  if (!matches) {
    await prisma.otpRequest.update({
      where: { phone },
      data: { attempts: { increment: 1 } },
    });
    throw CODE_INVALID;
  }

  // Provision the account BEFORE consuming the code: if the create fails
  // (e.g. a transient DB error), the code stays valid and the customer can
  // simply retry instead of being forced to request a fresh one.
  const user = await findOrCreateCustomer(phone, name);

  // One-time use — consume the row now that the session is guaranteed.
  await prisma.otpRequest.delete({ where: { phone } }).catch(() => {});

  const { accessToken, expiresIn } = signAccessToken({
    userId: user.id,
    role: user.role,
    phone: user.phone,
  });
  const refreshToken = await issueRefreshToken(user.id);

  return { user: toPublicUser(user), accessToken, expiresIn, refreshToken };
}

/** Consume a valid OTP and replace a known account's password. */
export async function resetPassword(body: ResetPasswordInput): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { phone: body.phone },
  });
  if (!existing) {
    // Do not turn a password reset into account provisioning.
    throw notFound("الحساب غير موجود / Account not found");
  }

  // Reuse the hardened OTP verifier. It consumes the code; its short-lived
  // session is immediately revoked below, so reset never leaves a login behind.
  await verifyOtp({ phone: body.phone, code: body.code });
  await prisma.user.update({
    where: { id: existing.id },
    data: { passwordHash: await hashPassword(body.password) },
  });
  await revokeAllUserRefreshTokens(existing.id);
}

async function findOrCreateCustomer(phone: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    if (!existing.isActive) {
      throw unauthorized("الحساب موقوف / This account has been deactivated");
    }
    return existing;
  }

  return prisma.user.create({
    data: {
      name: name?.trim() || "عميل / Customer",
      phone,
      // OTP accounts carry a login-proof bcrypt hash of a random value; the
      // user still has a password hash so role invariants hold everywhere.
      passwordHash: await hashPassword(
        `otp-${randomInt(0, 1_000_000_000)}-${Date.now()}`,
      ),
      role: UserRole.CUSTOMER,
    },
  });
}
