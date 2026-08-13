/**
 * Refresh tokens — long-lived session credentials with rotation.
 *
 * The raw token is a 384-bit random value handed to the client once. Only its
 * SHA-256 lives in the database, so a database leak is worthless to an
 * attacker and server logs never contain the credential.
 *
 * Rotation: every successful `/auth/refresh` mints a new token and revokes the
 * presented one inside a transaction. A stolen token replayed after the victim
 * refreshes hits a revoked row and is rejected — the practical fix for "what
 * if the refresh token leaks?".
 */

import { createHash, randomBytes } from 'node:crypto';
import { env, parseDurationMs } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { unauthorized } from '../../lib/http-error';

export const REFRESH_TOKEN_TTL_MS = parseDurationMs(env.jwt.refreshExpiresIn);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(raw: string): string {
  return sha256(raw);
}

/** Mints a fresh refresh token for a user. Returns the raw token (returned to
 *  the client exactly once). */
export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashRefreshToken(raw),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return raw;
}

export interface RotatedToken {
  /** The new raw refresh token to hand the client. */
  raw: string;
  userId: string;
}

/**
 * Validates a raw refresh token, rotates it, and returns the replacement.
 * Rejects when the token is unknown, revoked, or expired. Any rejection is a
 * 401 so the client can fall back to a clean sign-in.
 */
export async function rotateRefreshToken(raw: string): Promise<RotatedToken> {
  const invalid = unauthorized('الجلسة منتهية، يرجى تسجيل الدخول مجدداً / Session expired — please sign in again');

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(raw) },
  });

  if (!stored) throw invalid;
  if (stored.revokedAt) throw invalid;
  if (stored.expiresAt.getTime() < Date.now()) {
    await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {});
    throw invalid;
  }

  const nextRaw = generateRefreshToken();
  const nextHash = hashRefreshToken(nextRaw);

  // Rotation must be an atomic "claim": the revocation is CONDITIONAL on
  // `revokedAt: null`, so under concurrency exactly one request presenting the
  // same raw token wins the updateMany; a loser sees count 0 and is rejected.
  // Without the condition, two parallel refreshes both mint sessions from one
  // token, defeating rotation's replay protection.
  const rotated = await prisma.$transaction(async (tx) => {
    const revocation = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedByHash: nextHash },
    });
    if (revocation.count === 0) return false;
    await tx.refreshToken.create({
      data: {
        tokenHash: nextHash,
        userId: stored.userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return true;
  });

  if (!rotated) throw invalid;

  return { raw: nextRaw, userId: stored.userId };
}

/** Revokes a refresh token (sign-out). Idempotent — unknown tokens are fine. */
export async function revokeRefreshToken(raw: string): Promise<void> {
  await prisma.refreshToken
    .updateMany({
      where: {
        tokenHash: hashRefreshToken(raw),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    })
    .catch(() => {
      /* Already gone — nothing to revoke. */
    });
}

/** Revokes every live refresh token for a user (e.g. on a password change). */
export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
