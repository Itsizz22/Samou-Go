/**
 * Samou' Go — Device token service.
 *
 * Registers and unregisters FCM/APNs device tokens for push notifications.
 * Each user may have many tokens (multiple devices). Duplicate registrations
 * are idempotent — upserting by the unique token field.
 */

import { unauthorized } from '../../lib/http-error';
import { hashRefreshToken } from '../auth/refresh-token';
import { prisma } from '../../lib/prisma';
import type { RegisterDeviceTokenBody, UnregisterDeviceTokenBody } from './devices.schemas';

/** Register or update a device token. Idempotent — safe to call on every app open.
 *  Upsert semantics: re-registering the SAME token for the SAME user refreshes
 *  the device metadata + `updatedAt`; registering a token that was previously
 *  held by another account reassigns it. Tokens belonging to the user's OTHER
 *  devices are never touched. */
export async function registerDeviceToken(
  userId: string,
  body: RegisterDeviceTokenBody
): Promise<{ id: string; upserted: boolean }> {
  return prisma.$transaction(async tx => {
    const session = await tx.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(body.refreshToken) } });
    if (!session || session.userId !== userId || session.revokedAt || session.expiresAt <= new Date()) throw unauthorized('Session expired');
    // Lock the session against logout/rotation before binding. A delayed registration
    // can never resurrect ownership after the session was revoked.
    const live = await tx.refreshToken.updateMany({ where: { id: session.id, userId, revokedAt: null, expiresAt: { gt: new Date() } }, data: { expiresAt: session.expiresAt } });
    if (!live.count) throw unauthorized('Session expired');
    const existing = await tx.deviceToken.findUnique({ where: { token: body.token }, select: { id: true } });
    // A refreshed FCM token replaces only this session's previous token.
    await tx.deviceToken.deleteMany({ where: { userId, refreshTokenId: session.id, token: { not: body.token } } });
    const metadata = { userId, refreshTokenId: session.id, platform: body.platform, ...(body.deviceInfo !== undefined ? { deviceInfo: body.deviceInfo } : {}) };
    const row = await tx.deviceToken.upsert({ where: { token: body.token }, create: { token: body.token, ...metadata }, update: metadata, select: { id: true } });
    return { id: row.id, upserted: existing !== null };
  });
}

/** Remove a device token — called on logout or when the app is uninstalled. */
export async function unregisterDeviceToken(
  userId: string,
  body: UnregisterDeviceTokenBody
): Promise<void> {
  await prisma.deviceToken.deleteMany({
    where: {
      token: body.token,
      userId, // Only delete own tokens — never another user's.
    },
  });
}

/** Remove all tokens for a user — called on logout from all devices. */
export async function unregisterAllDeviceTokens(userId: string): Promise<void> {
  await prisma.deviceToken.deleteMany({
    where: { userId },
  });
}
