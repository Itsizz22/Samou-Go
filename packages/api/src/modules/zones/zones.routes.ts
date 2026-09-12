import { z } from 'zod';
import { importSamouTariff } from './import-tariff';
import { getRoutePricing, saveRoutePricing, routePricingSchema } from './route-pricing';
import { ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { Router } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize } from '../../middleware/authenticate';
import {
  createZoneHandler,
  deleteZoneHandler,
  listActiveZonesHandler,
  listAllZonesHandler,
  updateZoneHandler,
} from './zones.controller';

/**
 * Delivery fee zones. GET is public (active zones only — the captain's app and
 * the customer screens read the same list). Every WRITE is admin-only: the fee
 * lives in the zone row, so the captain can never send an amount.
 */
export const deliveryZonesRouter: Router = Router();

deliveryZonesRouter.post('/pricing/import-samou', authenticate, authorize(UserRole.ADMIN), asyncHandler(async (req, res) => { const body = parseWith(z.object({ revision: z.number().int().nonnegative() }).strict(), req.body); ok(res, await importSamouTariff(body.revision)); }));

deliveryZonesRouter.get('/pricing', authenticate, authorize(UserRole.ADMIN), asyncHandler(async (_req, res) => { ok(res, await getRoutePricing()); }));
deliveryZonesRouter.put('/pricing', authenticate, authorize(UserRole.ADMIN), asyncHandler(async (req, res) => { ok(res, await saveRoutePricing(parseWith(routePricingSchema, req.body))); }));

deliveryZonesRouter.get('/', asyncHandler(listActiveZonesHandler));
deliveryZonesRouter.get('/manage', authenticate, authorize(UserRole.ADMIN), asyncHandler(listAllZonesHandler));
deliveryZonesRouter.post('/', authenticate, authorize(UserRole.ADMIN), asyncHandler(createZoneHandler));
deliveryZonesRouter.patch('/:zoneId', authenticate, authorize(UserRole.ADMIN), asyncHandler(updateZoneHandler));
deliveryZonesRouter.put('/:zoneId', authenticate, authorize(UserRole.ADMIN), asyncHandler(updateZoneHandler));
deliveryZonesRouter.delete('/:zoneId', authenticate, authorize(UserRole.ADMIN), asyncHandler(deleteZoneHandler));
