import { Router } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize, optionalAuthenticate } from '../../middleware/authenticate';
import { orderLimiter, quoteLimiter } from '../../middleware/rate-limit';
import * as controller from './orders.controller';

export const ordersRouter: Router = Router();

/**
 * Quoting is open: the cart summary needs the delivery fee before the visitor
 * has an account. It touches no order rows.
 */
ordersRouter.post('/quote', optionalAuthenticate, quoteLimiter, asyncHandler(controller.quoteOrderHandler));

/**
 * SSE stream: GET /api/v1/orders/:orderId/events — fires whenever the order's
 * status changes. Paired with the `useOrderEvent` hook in `@samou-go/api-client`.
 *
 * Registered **above** the `authenticate` gate on purpose. A browser
 * `EventSource` cannot set an `Authorization` header, so a hard-gated stream
 * could never connect from any of the seven SPAs — it would 401 before the
 * handler ran and the hook would fall back to polling forever. `optionalAuthenticate`
 * therefore does the work: a token, when one arrives (curl, a native client),
 * is verified and ownership is enforced in the handler; an anonymous stream is
 * allowed and carries status transitions only — never address, phone or captain
 * PII. Order ids are unguessable, so that is the same exposure as the tracking
 * link itself.
 */
ordersRouter.get(
  '/:orderId/events',
  optionalAuthenticate,
  asyncHandler(controller.orderEventSSEHandler)
);

// Everything below requires a token.
ordersRouter.use(authenticate);

ordersRouter.post(
  '/',
  authorize(UserRole.CUSTOMER, UserRole.ADMIN),
  orderLimiter,
  asyncHandler(controller.createOrderHandler)
);
ordersRouter.post(
  '/checkout',
  authorize(UserRole.CUSTOMER, UserRole.ADMIN),
  orderLimiter,
  asyncHandler(controller.checkoutHandler)
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
 * The captain picks the delivery ZONE; the fee is derived server-side from
 * the admin-configured zone row. Fine-grained checks (assigned captain only,
 * live order, active zone) run in the service.
 */
ordersRouter.patch(
  '/:orderId/delivery-zone',
  authorize(UserRole.CAPTAIN, UserRole.ADMIN),
  asyncHandler(controller.setOrderDeliveryZoneHandler)
);

/**
 * PATCH /orders/:orderId/review — driver/customer sets a rating and comment
 * for the order. Only the order customer, store manager, or admin may do this,
 * and only while the order is in a non-terminal state.
 */
ordersRouter.patch(
  '/:orderId/review',
  authorize(UserRole.CUSTOMER, UserRole.STORE_MANAGER, UserRole.CAPTAIN, UserRole.ADMIN),
  asyncHandler(controller.setOrderReviewHandler)
);

/**
 * PATCH /orders/:orderId/set-delivery-fee — driver sets a custom delivery fee
 * when the platform setting `isDriverDynamicFeeEnabled` is true.
 * Only the assigned captain (or admin) may do this, and only while the order is live.
 */
ordersRouter.patch(
  '/:orderId/set-delivery-fee',
  authorize(UserRole.CAPTAIN, UserRole.ADMIN),
  asyncHandler(controller.setOrderDeliveryFeeHandler)
);
