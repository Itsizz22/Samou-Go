import { z } from 'zod';

/** POST /devices/token — register a push notification token. */
export const registerDeviceTokenSchema = z.object({
  token: z.string().trim().min(1, 'Device token is required').max(512, 'Device token is too long'),
  platform: z.enum(['android', 'ios', 'web']),
  /** Free-form device description (model, OS version, app build) — optional. */
  deviceInfo: z.string().trim().max(160, 'Device info is too long').optional(),
});

/** DELETE /devices/token — unregister a push notification token. */
export const unregisterDeviceTokenSchema = z.object({
  token: z.string().min(1, 'Device token is required'),
});

export type RegisterDeviceTokenBody = z.infer<typeof registerDeviceTokenSchema>;
export type UnregisterDeviceTokenBody = z.infer<typeof unregisterDeviceTokenSchema>;
