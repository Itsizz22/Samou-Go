import { chatOverview, readChat, writeChat, markChatRead } from './order-chat';
import type { Request, Response } from 'express';
import { created, ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { requireAuth } from '../../middleware/authenticate';
import { chatSchema, locationSchema, orderIdParamsSchema, platformSettingsSchema, ticketSchema, walletIdParamsSchema } from './platform.schemas';
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
  ok(res, await readChat(orderId, auth, req.query));
}

/** POST /api/v1/platform/orders/:orderId/chat */
export async function sendOrderChatHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  created(res, await writeChat(orderId, auth, req.body));
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

/** GET /api/v1/platform/wallet/statement */
export async function getWalletStatementHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const page = Number(req.query.page) || 1;
  const pageSize = Math.min(Number(req.query.pageSize) || 50, 100);
  ok(res, await platformService.getWalletStatement(auth, page, pageSize));
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

/** POST /api/v1/platform/admin/wallets/:walletId/credit */
export async function creditWalletHandler(req: Request, res: Response): Promise<void> {
  const { walletId } = parseWith(walletIdParamsSchema, req.params);
  ok(res, await platformService.creditWallet(walletId, req.body));
}

/** GET /api/v1/platform/settings */
export async function getPlatformSettingsHandler(_req: Request, res: Response): Promise<void> {
  ok(res, await platformService.getPlatformSettings());
}

/** PATCH /api/v1/platform/settings — admin economy knobs */
export async function updatePlatformSettingsHandler(req: Request, res: Response): Promise<void> {
  const body = parseWith(platformSettingsSchema, req.body);
  ok(res, await platformService.updatePlatformSettings(body));
}

export async function chatOverviewHandler(req: Request, res: Response) { const { orderId } = parseWith(orderIdParamsSchema, req.params); ok(res, await chatOverview(orderId, requireAuth(req))); }
export async function chatReadHandler(req: Request, res: Response) { const { orderId } = parseWith(orderIdParamsSchema, req.params); ok(res, await markChatRead(orderId, requireAuth(req), req.body)); }
