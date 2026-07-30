import type { Request, Response } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { created, ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { forbidden } from '../../lib/http-error';
import { requireAuth } from '../../middleware/authenticate';
import {
  assignCaptainSchema,
  createOrderSchema,
  orderIdParamsSchema,
  orderListQuerySchema,
  quoteOrderSchema,
  updateOrderStatusSchema,
} from './orders.schemas';
import * as ordersService from './orders.service';

/** POST /api/v1/orders/quote — price a basket without saving anything. */
export async function quoteOrderHandler(req: Request, res: Response): Promise<void> {
  const body = parseWith(quoteOrderSchema, req.body);
  ok(res, await ordersService.quoteOrder(body));
}

/** POST /api/v1/orders */
export async function createOrderHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  if (auth.role !== UserRole.CUSTOMER && auth.role !== UserRole.ADMIN) {
    throw forbidden('الطلبات يُنشئها الزبائن فقط / Only customers may place orders');
  }
  const body = parseWith(createOrderSchema, req.body);
  created(res, await ordersService.createOrder(auth.sub, body));
}

/** GET /api/v1/orders */
export async function listOrdersHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const query = parseWith(orderListQuerySchema, req.query);
  ok(res, await ordersService.listOrders(auth, query));
}

/** GET /api/v1/orders/:orderId */
export async function getOrderHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  ok(res, await ordersService.getOrder(auth, orderId));
}

/** PATCH /api/v1/orders/:orderId/status */
export async function updateOrderStatusHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  const body = parseWith(updateOrderStatusSchema, req.body);
  ok(res, await ordersService.updateOrderStatus(auth, orderId, body));
}

/** PATCH /api/v1/orders/:orderId/captain */
export async function assignCaptainHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  const body = parseWith(assignCaptainSchema, req.body);
  ok(res, await ordersService.assignCaptain(auth, orderId, body));
}
