import { z } from 'zod';

/** POST /devices/token — register a push notification token. */
export const registerDeviceTokenSchema = z.object({
  token: z.string().min(1, 'Device token is required'),
  platform: z.enum(['android', 'ios', 'web']),
});

/** DELETE /devices/token — unregister a push notification token. */
export const unregisterDeviceTokenSchema = z.object({
  token: z.string().min(1, 'Device token is required'),
});

export type RegisterDeviceTokenBody = z.infer<typeof registerDeviceTokenSchema>;
export type UnregisterDeviceTokenBody = z.infer<typeof unregisterDeviceTokenSchema>;
