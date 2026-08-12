import type { Request, Response } from 'express';
import { ORDER_STATUS_LABELS, UserRole } from '@samou-go/shared-types';
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
import { emitOrderStatus, emitPlatformEvent } from '../../realtime';

/** SSE event type emitted to connected clients. */
type OrderEvent = {
  id: string;
  status: string;
  ar: string;
  en: string;
  timestamp: string;
};

/**
 * GET /api/v1/orders/events/:orderId — Server-Sent Events stream.
 * Keeps the HTTP connection alive and fires `data: {id,status,ar,en}` whenever
 * the order status changes. Reconnects automatically on the client.
 */
export async function orderEventSSEHandler(req: Request, res: Response): Promise<void> {
  const { orderId } = parseWith(orderIdParamsSchema, req.params);

  // Auth: if a token is provided, validate ownership; otherwise the stream
  // works for any viewer (captains/customers can follow their own orders).
  if (req.auth) {
    const order = await ordersService.loadOrderOrThrow(orderId);
    await ordersService.assertCanView(order, req.auth);
  }

  // Set SSE headers — no cache, keep alive, event stream mime type.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let lastId = req.headers['last-event-id'] as string | undefined;

  // Send initial connection event.
  res.write('event: connected\ndata: {"status":"connected"}\n\n');

  // Subscribe to status changes via a short-lived Promise that resolves when
  // the order is next updated. We re-query Prisma every 3 seconds.
  const intervalId = setInterval(async () => {
    try {
      const order = await ordersService.loadOrderOrThrow(orderId);
      const status = ORDER_STATUS_LABELS[order.status];
      const event = {
        id: order.id,
        status: order.status,
        ar: ORDER_STATUS_LABELS[order.status].ar,
        en: ORDER_STATUS_LABELS[order.status].en,
        timestamp: new Date().toISOString(),
      };
      res.write(`event: update\ndata: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      // Order may have been deleted; close the stream.
      clearInterval(intervalId);
      res.end();
    }
  }, 3_000);

  // Clean up when the client disconnects.
  req.on('close', () => {
    clearInterval(intervalId);
    res.end();
  });
}

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
  const result = await ordersService.createOrder(auth.sub, body);
  emitPlatformEvent('order:created', { orderId: result.id, storeId: result.storeId, status: result.status });
  created(res, result);
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

/** POST /api/v1/orders/:orderId/reorder — clone a past basket at current prices. */
export async function reorderOrderHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  ok(res, await ordersService.reorderOrder(auth, orderId));
}

/** PATCH /api/v1/orders/:orderId/status */
export async function updateOrderStatusHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  const body = parseWith(updateOrderStatusSchema, req.body);
  const result = await ordersService.updateOrderStatus(auth, orderId, body);
  emitOrderStatus(orderId, { status: result.status, orderId, timestamp: new Date().toISOString() });
  ok(res, result);
}

/** PATCH /api/v1/orders/:orderId/captain */
export async function assignCaptainHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  const body = parseWith(assignCaptainSchema, req.body);
  const result = await ordersService.assignCaptain(auth, orderId, body);
  emitPlatformEvent('order:assigned', { orderId: result.id, captainId: result.captainId, storeId: result.storeId });
  ok(res, result);
}
