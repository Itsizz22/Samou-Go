import { Router } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize } from '../../middleware/authenticate';
import * as controller from './platform.controller';

export const platformRouter: Router = Router();

platformRouter.use(authenticate);

platformRouter.put(
  '/captains/me/location',
  authorize(UserRole.CAPTAIN),
  asyncHandler(controller.updateCaptainLocationHandler)
);

platformRouter.get('/orders/:orderId/location', asyncHandler(controller.getOrderLocationHandler));

platformRouter.post(
  '/orders/:orderId/rating',
  authorize(UserRole.CUSTOMER),
  asyncHandler(controller.rateOrderHandler)
);

platformRouter.get('/orders/:orderId/chat', asyncHandler(controller.listOrderChatHandler));

platformRouter.post('/orders/:orderId/chat', asyncHandler(controller.sendOrderChatHandler));

platformRouter.post('/support/tickets', asyncHandler(controller.createSupportTicketHandler));

platformRouter.get('/wallet', asyncHandler(controller.getWalletHandler));

platformRouter.get('/admin/financials', authorize(UserRole.ADMIN), asyncHandler(controller.getAdminFinancialsHandler));

platformRouter.post(
  '/admin/wallets/:walletId/settle',
  authorize(UserRole.ADMIN),
  asyncHandler(controller.settleWalletHandler)
);
