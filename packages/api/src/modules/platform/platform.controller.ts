import type { Request, Response } from 'express';
import { created, ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { requireAuth } from '../../middleware/authenticate';
import { chatSchema, locationSchema, orderIdParamsSchema, ticketSchema, walletIdParamsSchema } from './platform.schemas';
import * as platformService from './platform.service';

/** PUT /api/v1/platform/captains/me/location */
export async function updateCaptainLocationHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const body = parseWith(locationSchema, req.body);
  ok(res, await platformService.updateCaptainLocation(auth.sub, body));
}

/** GET /api/v1/platform/orders/:orderId/location */
export async function getOrderLocationHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  ok(res, await platformService.getOrderLocation(auth, orderId));
}

/** POST /api/v1/platform/orders/:orderId/rating */
export async function rateOrderHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  created(res, await platformService.rateOrder(orderId, auth.sub, req.body));
}

/** GET /api/v1/platform/orders/:orderId/chat */
export async function listOrderChatHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  ok(res, await platformService.listOrderChat(orderId, auth));
}

/** POST /api/v1/platform/orders/:orderId/chat */
export async function sendOrderChatHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  created(res, await platformService.sendOrderChat(orderId, auth, req.body));
}

/** POST /api/v1/platform/support/tickets */
export async function createSupportTicketHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const body = parseWith(ticketSchema, req.body);
  created(res, await platformService.createSupportTicket(auth, body));
}

/** GET /api/v1/platform/wallet */
export async function getWalletHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  ok(res, await platformService.getWallet(auth));
}

/** GET /api/v1/platform/admin/financials */
export async function getAdminFinancialsHandler(_req: Request, res: Response): Promise<void> {
  ok(res, await platformService.getAdminFinancials());
}

/** POST /api/v1/platform/admin/wallets/:walletId/settle */
export async function settleWalletHandler(req: Request, res: Response): Promise<void> {
  const { walletId } = parseWith(walletIdParamsSchema, req.params);
  ok(res, await platformService.settleWallet(walletId, req.body));
}
