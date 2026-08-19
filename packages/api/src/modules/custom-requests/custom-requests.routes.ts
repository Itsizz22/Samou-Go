import { Router } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize } from '../../middleware/authenticate';
import * as controller from './custom-requests.controller';

export const customerCustomRequestsRouter: Router = Router();
export const storeCustomRequestsRouter: Router = Router();

/* ---- Customer side — the caller's own requests --------------------------- */

customerCustomRequestsRouter.use(authenticate, authorize(UserRole.CUSTOMER, UserRole.ADMIN));

customerCustomRequestsRouter.get('/', asyncHandler(controller.listCustomerRequestsHandler));
customerCustomRequestsRouter.post('/', asyncHandler(controller.createCustomRequestHandler));
customerCustomRequestsRouter.patch(
  '/:id/respond',
  asyncHandler(controller.respondToCustomRequestHandler)
);
customerCustomRequestsRouter.post(
  '/:id/cancel',
  asyncHandler(controller.cancelCustomerRequestHandler)
);

/* ---- Store side — requests aimed at the manager's (or any admin's) stores - */

storeCustomRequestsRouter.use(
  authenticate,
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN)
);

storeCustomRequestsRouter.get('/', asyncHandler(controller.listStoreRequestsHandler));
storeCustomRequestsRouter.post('/:id/offer', asyncHandler(controller.offerPriceOnCustomRequestHandler));
storeCustomRequestsRouter.post('/:id/cancel', asyncHandler(controller.cancelStoreRequestHandler));