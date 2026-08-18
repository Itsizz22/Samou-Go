import { Router } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize, optionalAuthenticate } from '../../middleware/authenticate';
import * as controller from './stores.controller';
import * as offersController from '../offers/offers.controller';

/**
 * Public catalogue. No token required — the Customer Shop home screen must
 * render for a first-time visitor. `optionalAuthenticate` is mounted so a
 * logged-in caller is still identified for future personalisation.
 */
export const storesRouter: Router = Router();

/* ---- Public read-only routes -------------------------------------------- */

storesRouter.get('/', optionalAuthenticate, asyncHandler(controller.listStoresHandler));
// Must be registered BEFORE `/:storeId` — Express matches in order and
// `/mine` would otherwise be swallowed as a store id.
storesRouter.get(
  '/mine',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(controller.listMyStoresHandler)
);

storesRouter.get('/:storeId', optionalAuthenticate, asyncHandler(controller.getStoreHandler));
storesRouter.get(
  '/:storeId/full',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(controller.getStoreFullHandler)
);
storesRouter.get('/:storeId/products', optionalAuthenticate, asyncHandler(controller.listStoreProductsHandler));

/* ---- Write routes (STORE_MANAGER own store, or ADMIN) ------------------- */

/** Approval is ADMIN-only. Kept next to the generic update for readability. */
storesRouter.patch(
  '/:storeId/approve',
  authenticate,
  authorize(UserRole.ADMIN),
  asyncHandler(controller.approveStoreHandler)
);

/** "Recommended by us" flag — ADMIN-only, mirrors the approve gate. */
storesRouter.patch(
  '/:storeId/recommend',
  authenticate,
  authorize(UserRole.ADMIN),
  asyncHandler(controller.updateStoreRecommendationHandler)
);

storesRouter.patch(
  '/:storeId',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(controller.updateStoreHandler)
);

storesRouter.post(
  '/:storeId/products',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(controller.createProductHandler)
);

storesRouter.patch(
  '/:storeId/products/:productId',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(controller.updateProductHandler)
);

storesRouter.delete(
  '/:storeId/products/:productId',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(controller.deleteProductHandler)
);

/* ---- Category (menu section) management — STORE_MANAGER own store or ADMIN */

storesRouter.post(
  '/:storeId/categories',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(controller.createCategoryHandler)
);

storesRouter.patch(
  '/:storeId/categories/:categoryId',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(controller.updateCategoryHandler)
);

storesRouter.delete(
  '/:storeId/categories/:categoryId',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(controller.deleteCategoryHandler)
);

/* ---- Offers (marketing banners) — STORE_MANAGER own store or ADMIN ------ */

storesRouter.get(
  '/:storeId/offers',
  optionalAuthenticate,
  asyncHandler(offersController.listStoreOffersHandler)
);

storesRouter.get(
  '/:storeId/offers/manage',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(offersController.listMyStoreOffersHandler)
);

storesRouter.post(
  '/:storeId/offers',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(offersController.createOfferHandler)
);

storesRouter.patch(
  '/:storeId/offers/:offerId',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(offersController.updateOfferHandler)
);

storesRouter.patch(
  '/:storeId/offers/:offerId/toggle',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(offersController.toggleOfferHandler)
);

storesRouter.delete(
  '/:storeId/offers/:offerId',
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(offersController.deleteOfferHandler)
);
