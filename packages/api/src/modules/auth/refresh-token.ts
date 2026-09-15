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
    const replacement = await tx.refreshToken.create({
      data: {
        tokenHash: nextHash,
        userId: stored.userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    await tx.deviceToken.updateMany({ where: { refreshTokenId: stored.id, userId: stored.userId }, data: { refreshTokenId: replacement.id } });
    return true;
  });

  if (!rotated) throw invalid;

  return { raw: nextRaw, userId: stored.userId };
}

/** Revokes a refresh token (sign-out). Idempotent — unknown tokens are fine. */
export async function revokeRefreshToken(raw: string, legacyDeviceToken?: string): Promise<void> {
  await prisma.$transaction(async tx => {
    let hash: string | null = hashRefreshToken(raw);
    // Follow only this rotation lineage, never the user's other devices.
    while (hash) {
      const session: { id: string; userId: string } | null = await tx.refreshToken.findUnique({ where: { tokenHash: hash }, select: { id: true, userId: true } });
      if (!session) break;
      await tx.refreshToken.updateMany({ where: { id: session.id }, data: { revokedAt: new Date() } });
      // Re-read after obtaining the row lock: a concurrent rotation may have won.
      const locked: { replacedByHash: string | null } | null = await tx.refreshToken.findUnique({ where: { id: session.id }, select: { replacedByHash: true } });
      await tx.deviceToken.deleteMany({ where: { userId: session.userId, OR: [
        { refreshTokenId: session.id },
        ...(legacyDeviceToken ? [{ refreshTokenId: null, token: legacyDeviceToken }] : []),
      ] } });
      hash = locked?.replacedByHash ?? null;
    }
  });
}

/**
 * Resolves the user who owns a raw refresh token and returns their id, or
 * `null` when the token is unknown. Only the SHA-256 hash is queried — the raw
 * credential never touches the DB. Used by logout to scope a selective
 * device-token removal to the session's account.
 */
export async function findUserIdForRefreshToken(raw: string): Promise<string | null> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(raw) },
    select: { userId: true },
  });
  return stored?.userId ?? null;
}

/** Revokes every live refresh token for a user (e.g. on a password change). */
export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  });
}
