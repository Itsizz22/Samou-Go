import type { Request, Response } from 'express';
import { ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { requireAuth } from '../../middleware/authenticate';
import { registerDeviceTokenSchema, unregisterDeviceTokenSchema } from './devices.schemas';
import * as devicesService from './devices.service';

/** POST /api/v1/devices/token — register a push notification device token. */
export async function registerTokenHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const body = parseWith(registerDeviceTokenSchema, req.body);
  ok(res, await devicesService.registerDeviceToken(auth.sub, body));
}

/** DELETE /api/v1/devices/token — unregister a push notification device token. */
export async function unregisterTokenHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const body = parseWith(unregisterDeviceTokenSchema, req.body);
  await devicesService.unregisterDeviceToken(auth.sub, body);
  ok(res, { success: true });
}
