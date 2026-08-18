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

deliveryZonesRouter.get('/', asyncHandler(listActiveZonesHandler));
deliveryZonesRouter.get('/manage', authenticate, authorize(UserRole.ADMIN), asyncHandler(listAllZonesHandler));
deliveryZonesRouter.post('/', authenticate, authorize(UserRole.ADMIN), asyncHandler(createZoneHandler));
deliveryZonesRouter.patch('/:zoneId', authenticate, authorize(UserRole.ADMIN), asyncHandler(updateZoneHandler));
deliveryZonesRouter.delete('/:zoneId', authenticate, authorize(UserRole.ADMIN), asyncHandler(deleteZoneHandler));