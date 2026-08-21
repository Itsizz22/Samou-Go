/**
 * Samou' Go — Device token service.
 *
 * Registers and unregisters FCM/APNs device tokens for push notifications.
 * Each user may have many tokens (multiple devices). Duplicate registrations
 * are idempotent — upserting by the unique token field.
 */

import { prisma } from '../../lib/prisma';
import type { RegisterDeviceTokenBody, UnregisterDeviceTokenBody } from './devices.schemas';

/** Register or update a device token. Idempotent — safe to call on every app open. */
export async function registerDeviceToken(
  userId: string,
  body: RegisterDeviceTokenBody
): Promise<{ id: string }> {
  const existing = await prisma.deviceToken.findUnique({
    where: { token: body.token },
    select: { id: true, userId: true },
  });

  if (existing) {
    // Token already registered — if it belongs to a different user (e.g. device
    // was factory-reset and re-registered by another account), reassign it.
    if (existing.userId !== userId) {
      await prisma.deviceToken.update({
        where: { id: existing.id },
        data: { userId, platform: body.platform },
      });
    }
    return { id: existing.id };
  }

  const row = await prisma.deviceToken.create({
    data: {
      userId,
      token: body.token,
      platform: body.platform,
    },
  });

  return { id: row.id };
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
