import type { Request, Response } from 'express';
import { created, ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import {
  createDeliveryZoneSchema,
  updateDeliveryZoneSchema,
  zoneIdParamsSchema,
} from './zones.schemas';
import * as zonesService from './zones.service';

/** GET /api/v1/delivery-zones — public, active zones only. */
export async function listActiveZonesHandler(req: Request, res: Response): Promise<void> {
  ok(res, await zonesService.listActiveZones());
}

/** GET /api/v1/delivery-zones/manage — admin, includes inactive zones. */
export async function listAllZonesHandler(req: Request, res: Response): Promise<void> {
  ok(res, await zonesService.listAllZones());
}

/** POST /api/v1/delivery-zones — admin creates a zone + its fee. */
export async function createZoneHandler(req: Request, res: Response): Promise<void> {
  const body = parseWith(createDeliveryZoneSchema, req.body);
  created(res, await zonesService.createZone(body));
}

/** PATCH /api/v1/delivery-zones/:zoneId — admin edits the zone or its fee. */
export async function updateZoneHandler(req: Request, res: Response): Promise<void> {
  const { zoneId } = parseWith(zoneIdParamsSchema, req.params);
  const body = parseWith(updateDeliveryZoneSchema, req.body);
  ok(res, await zonesService.updateZone(zoneId, body));
}

/** DELETE /api/v1/delivery-zones/:zoneId — admin removes a zone. */
export async function deleteZoneHandler(req: Request, res: Response): Promise<void> {
  const { zoneId } = parseWith(zoneIdParamsSchema, req.params);
  await zonesService.deleteZone(zoneId);
  ok(res, { deleted: true });
}