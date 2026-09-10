import { getTracking } from './tracking.service';
import { requireAuth } from '../../middleware/authenticate';
import { parseWith } from '../../lib/validate';
import { orderIdParamsSchema } from './platform.schemas';
import { prisma } from '../../lib/prisma';
import { ok } from '../../lib/respond';
import { Router } from 'express';
import { OrderStatus, UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize } from '../../middleware/authenticate';
import * as controller from './platform.controller';

export const platformRouter: Router = Router();

platformRouter.use(authenticate);
platformRouter.get('/orders/:orderId/tracking', asyncHandler(async (req, res) => {
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  res.setHeader('Cache-Control', 'no-store');
  ok(res, await getTracking(requireAuth(req), orderId));
}));

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

platformRouter.get('/wallet', asyncHandler(controller.getWalletHandler));
platformRouter.get('/wallet/statement', asyncHandler(controller.getWalletStatementHandler));

platformRouter.get('/admin/financials', authorize(UserRole.ADMIN), asyncHandler(controller.getAdminFinancialsHandler));

platformRouter.post(
  '/admin/wallets/:walletId/settle',
  authorize(UserRole.ADMIN),
  asyncHandler(controller.settleWalletHandler)
);

platformRouter.post(
  '/admin/wallets/:walletId/credit',
  authorize(UserRole.ADMIN),
  asyncHandler(controller.creditWalletHandler)
);

platformRouter.get('/settings', asyncHandler(controller.getPlatformSettingsHandler));

platformRouter.patch(
  '/settings',
  authorize(UserRole.ADMIN),
  asyncHandler(controller.updatePlatformSettingsHandler)
);

platformRouter.get('/admin/overdue-orders', authorize(UserRole.ADMIN), asyncHandler(async (_req, res) => {
  const where = { OR: [{ status: OrderStatus.PENDING, createdAt: { lte: new Date(Date.now() - 5 * 60_000) } }, { status: { in: [OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP] }, captainId: null, fulfillmentType: 'DELIVERY' as const, createdAt: { lte: new Date(Date.now() - 10 * 60_000) } }] };
  const [items, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 50, select: { id: true, orderNumber: true, status: true, createdAt: true, store: { select: { nameAr: true, phone: true } } } }),
    prisma.order.count({ where }),
  ]);
  ok(res, { items, total, thresholdMinutes: 5 });
}));