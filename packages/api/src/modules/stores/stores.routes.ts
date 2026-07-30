import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { optionalAuthenticate } from '../../middleware/authenticate';
import * as controller from './stores.controller';

/**
 * Public catalogue. No token required — the Customer Shop home screen must
 * render for a first-time visitor. `optionalAuthenticate` is mounted so a
 * logged-in caller is still identified for future personalisation.
 */
export const storesRouter: Router = Router();

storesRouter.use(optionalAuthenticate);

storesRouter.get('/', asyncHandler(controller.listStoresHandler));
storesRouter.get('/:storeId', asyncHandler(controller.getStoreHandler));
storesRouter.get('/:storeId/products', asyncHandler(controller.listStoreProductsHandler));
