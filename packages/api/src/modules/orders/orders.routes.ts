import { Router } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize, optionalAuthenticate } from '../../middleware/authenticate';
import * as controller from './orders.controller';

export const ordersRouter: Router = Router();

/**
 * Quoting is open: the cart summary needs the delivery fee before the visitor
 * has an account. It touches no order rows.
 */
ordersRouter.post('/quote', optionalAuthenticate, asyncHandler(controller.quoteOrderHandler));

// Everything below requires a token.
ordersRouter.use(authenticate);

ordersRouter.post(
  '/',
  authorize(UserRole.CUSTOMER, UserRole.ADMIN),
  asyncHandler(controller.createOrderHandler)
);
ordersRouter.get('/', asyncHandler(controller.listOrdersHandler));
ordersRouter.get('/:orderId', asyncHandler(controller.getOrderHandler));

/**
 * Re-order is a customer convenience: clone a past basket at current prices.
 * The ownership check runs in the service (`assertCanView`), so admins can
 * reach it too.
 */
ordersRouter.post(
  '/:orderId/reorder',
  authorize(UserRole.CUSTOMER, UserRole.ADMIN),
  asyncHandler(controller.reorderOrderHandler)
);

/**
 * The fine-grained rules live in the service (state machine × role × ownership).
 * `authorize` here is only a coarse first gate.
 */
ordersRouter.patch(
  '/:orderId/status',
  authorize(UserRole.CUSTOMER, UserRole.STORE_MANAGER, UserRole.CAPTAIN, UserRole.ADMIN),
  asyncHandler(controller.updateOrderStatusHandler)
);

ordersRouter.patch(
  '/:orderId/captain',
  authorize(UserRole.STORE_MANAGER, UserRole.ADMIN),
  asyncHandler(controller.assignCaptainHandler)
);

/**
 * SSE endpoint: GET /api/v1/orders/events/:orderId
 * Returns a text/event-stream that fires whenever the order status changes.
 * Works with the `useOrderEvent` hook on any frontend.
 * Anonymous connections keep the stream alive; auth validates ownership.
 */
ordersRouter.get(
  '/:orderId/events',
  optionalAuthenticate,
  asyncHandler(controller.orderEventSSEHandler)
);
