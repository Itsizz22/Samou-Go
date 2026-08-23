import type { Request, Response } from 'express';
import { ORDER_STATUS_LABELS, OrderStatus, UserRole } from '@samou-go/shared-types';
import { created, ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { forbidden } from '../../lib/http-error';
import { requireAuth } from '../../middleware/authenticate';
import {
  assignCaptainSchema,
  checkoutSchema,
  createOrderSchema,
  orderIdParamsSchema,
  orderListQuerySchema,
  quoteOrderSchema,
  setDeliveryFeeSchema,
  reviewSchema,
  updateOrderStatusSchema,
} from './orders.schemas';
import { setOrderDeliveryZoneSchema } from '../zones/zones.schemas';
import * as ordersService from './orders.service';
import { emitOrderStatus, emitPlatformEvent } from '../../realtime';
import { sendPushToUser, sendPushToMany } from '../../lib/push';
import { prisma } from '../../lib/prisma';
import type { OrderDetail } from '@samou-go/shared-types';

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

  // The order must exist before the stream opens — a valid order id gets a
  // live stream, an invented one closes immediately instead of becoming an
  // "is this id real?" oracle.
  const order = await ordersService.loadOrderOrThrow(orderId);
  // Auth: when a token is present, enforce ownership so a signed-in caller can
  // only follow their own orders. Anonymous streams carry status updates only
  // (no address/phone/captain PII is ever emitted) for unguessable order ids.
  if (req.auth) {
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

  // Push: notify all store managers of the new order.
  void (async () => {
    try {
      const store = await prisma.store.findUnique({
        where: { id: result.storeId },
        select: { managerId: true, nameAr: true },
      });
      if (store) {
        await sendPushToUser(store.managerId, {
          title: 'طلب جديد 🛒',
          body: `طلب جديد #${result.orderNumber} من ${result.customer.name}`,
          data: { orderId: result.id, screen: 'order' },
        });
      }
    } catch {
      // Push failure must never break the order flow.
    }
  })();

  created(res, result);
}

/** POST /api/v1/orders/checkout — multi-store cart checkout. */
export async function checkoutHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  if (auth.role !== UserRole.CUSTOMER && auth.role !== UserRole.ADMIN) {
    throw forbidden('الطلبات يُنشئها الزبائن فقط / Only customers may place orders');
  }
  const body = parseWith(checkoutSchema, req.body);
  const result = await ordersService.createCheckoutOrders(auth.sub, body);

  // Push: notify each store manager of their sub-order.
  void (async () => {
    try {
      const storeIds = result.orders.map(o => o.storeId);
      const stores = await prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, managerId: true, nameAr: true },
      });
      const storeMap = new Map(stores.map(s => [s.id, s]));
      for (const sub of result.orders) {
        const store = storeMap.get(sub.storeId);
        if (store) {
          await sendPushToUser(store.managerId, {
            title: 'طلب جديد 🛒',
            body: `طلب جديد #${sub.orderNumber} من متجر ${store.nameAr}`,
            data: { orderId: sub.orderId, screen: 'order' },
          });
        }
        emitPlatformEvent('order:created', { orderId: sub.orderId, storeId: sub.storeId, status: 'PENDING' as OrderStatus });
      }
    } catch {
      // Push failure must never break the order flow.
    }
  })();

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

/**
 * POST /api/v1/orders/:orderId/claim — atomic captain claim.
 * Transitions READY_FOR_PICKUP → ON_THE_WAY and assigns the captain.
 * Uses optimistic locking: exactly one captain wins concurrent claims.
 */
export async function claimOrderHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  const result = await ordersService.updateOrderStatus(auth, orderId, { status: OrderStatus.ON_THE_WAY });
  emitOrderStatus(orderId, { status: result.status, orderId, timestamp: new Date().toISOString() });
  ok(res, result);
}

/**
 * GET /api/v1/orders/:orderId/pin — returns the delivery PIN.
 * Customer-only: the PIN is the shared secret between customer and captain.
 */
export async function getOrderPinHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  const order = await ordersService.loadOrderOrThrow(orderId);
  await ordersService.assertCanView(order, auth);
  if (auth.role !== UserRole.CUSTOMER || order.customerId !== auth.sub) {
    throw forbidden('فقط العميل يمكنه رؤية رمز التوصيل / Only the customer may view the delivery PIN');
  }
  ok(res, { deliveryPin: order.deliveryPin ?? null });
}

/** PATCH /api/v1/orders/:orderId/status */
export async function updateOrderStatusHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  const body = parseWith(updateOrderStatusSchema, req.body);
  const result = await ordersService.updateOrderStatus(auth, orderId, body);
  emitOrderStatus(orderId, { status: result.status, orderId, timestamp: new Date().toISOString() });

  // Push: notify the relevant party about the status change.
  void notifyStatusChange(result, orderId, body.status);

  ok(res, result);
}

/** PATCH /api/v1/orders/:orderId/captain */
export async function assignCaptainHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  const body = parseWith(assignCaptainSchema, req.body);
  const result = await ordersService.assignCaptain(auth, orderId, body);
  emitPlatformEvent('order:assigned', { orderId: result.id, captainId: result.captainId, storeId: result.storeId });

  // Push: notify the captain they have a new delivery assignment.
  if (result.captainId) {
    const captainId = result.captainId;
    void (async () => {
      try {
        await sendPushToUser(captainId, {
          title: 'توصيل جديد 🚗',
          body: `لديك طلب جديد #${result.orderNumber} — اضغط للتوصيل`,
          data: { orderId: result.id, screen: 'order' },
        });
      } catch {
        // Push failure must never break the assignment flow.
      }
    })();
  }

  ok(res, result);
}

/** PATCH /api/v1/orders/:orderId/delivery-zone — captain picks the zone, server derives the fee. */
export async function setOrderDeliveryZoneHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  const body = parseWith(setOrderDeliveryZoneSchema, req.body);
  const result = await ordersService.setOrderDeliveryZone(auth, orderId, body.zoneId);
  // Push a refresh to the order's room so the customer's tracking screen shows
  // the new fee without waiting for its polling interval.
  emitOrderStatus(orderId, { status: result.status, orderId, timestamp: new Date().toISOString() });
  ok(res, result);
}

/** PATCH /api/v1/orders/:orderId/set-delivery-fee — driver sets a custom delivery fee (dynamic fee mode). */
export async function setOrderDeliveryFeeHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  const body = parseWith(setDeliveryFeeSchema, req.body);
  const result = await ordersService.setOrderDeliveryFee(auth, orderId, body.deliveryFee);
  // Push a refresh to the order's room so the customer's tracking screen shows
  // the new fee without waiting for its polling interval.
  emitOrderStatus(orderId, { status: result.status, orderId, timestamp: new Date().toISOString() });
  ok(res, result);
}

/**
 * Send a push notification to the relevant party after an order status change.
 * Fire-and-forget — push failure must never break the API response.
 */
async function notifyStatusChange(
  order: OrderDetail,
  orderId: string,
  newStatus: string
): Promise<void> {
  try {
    const labels = ORDER_STATUS_LABELS[newStatus as OrderStatus];
    if (!labels) return;

    switch (newStatus) {
      case OrderStatus.ACCEPTED: {
        // Store accepted → notify the customer.
        await sendPushToUser(order.customerId, {
          title: 'تم قبول الطلب ✅',
          body: `متجر ${order.store.nameAr} قبول طلبك #${order.orderNumber}`,
          data: { orderId, screen: 'tracking' },
        });
        break;
      }
      case OrderStatus.PREPARING: {
        // Store is preparing → notify the customer.
        await sendPushToUser(order.customerId, {
          title: 'جاري التحضير 👨‍🍳',
          body: `طلبك #${order.orderNumber} قيد التحضير`,
          data: { orderId, screen: 'tracking' },
        });
        break;
      }
      case OrderStatus.READY_FOR_PICKUP: {
        // Ready → notify the customer + all available captains.
        await sendPushToUser(order.customerId, {
          title: 'جاهز للاستلام 📦',
          body: `طلبك #${order.orderNumber} جاهز — في انتظار الكابتن`,
          data: { orderId, screen: 'tracking' },
        });
        // Notify available captains that there's a new order to claim.
        const availableCaptains = await prisma.user.findMany({
          where: {
            role: UserRole.CAPTAIN,
            isActive: true,
            isVerified: true,
            isAvailable: true,
          },
          select: { id: true },
        });
        if (availableCaptains.length > 0) {
          await sendPushToMany(
            availableCaptains.map((c) => c.id),
            {
              title: 'طلب جاهز للاستلام 📦',
              body: `طلب #${order.orderNumber} من ${order.store.nameAr} جاهز للاستلام`,
              data: { orderId, screen: 'order' },
            }
          );
        }
        break;
      }
      case OrderStatus.ON_THE_WAY: {
        // Captain picked up → notify the customer.
        if (order.customerId && order.captainId) {
          await sendPushToUser(order.customerId, {
            title: 'في الطريق إليك 🚗',
            body: `طلبك #${order.orderNumber} في الطريق — الكابتن في الطريق`,
            data: { orderId, screen: 'tracking' },
          });
        }
        break;
      }
      case OrderStatus.DELIVERED: {
        // Delivered → notify the customer.
        await sendPushToUser(order.customerId, {
          title: 'تم التوصيل 🎉',
          body: `طلبك #${order.orderNumber} تم توصيله — بالعافية!`,
          data: { orderId, screen: 'tracking' },
        });
        break;
      }
      case OrderStatus.CANCELLED: {
        // Cancelled → notify the other party.
        // If customer cancelled, notify store manager. If store cancelled, notify customer.
        if (order.captainId) {
          await sendPushToUser(order.captainId, {
            title: 'تم إلغاء الطلب ❌',
            body: `طلب #${order.orderNumber} تم إلغاؤه`,
            data: { orderId, screen: 'order' },
          });
        }
        await sendPushToUser(order.customerId, {
          title: 'تم إلغاء الطلب ❌',
          body: `طلب #${order.orderNumber} تم إلغاؤه`,
          data: { orderId, screen: 'orders' },
        });
        break;
      }
    }
  } catch {
    // Push failure must never break the status update response.
  }
}

/** PATCH /api/v1/orders/:orderId/review — sets a rating and comment for the order. */
export async function setOrderReviewHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { orderId } = parseWith(orderIdParamsSchema, req.params);
  const body = parseWith(reviewSchema, req.body);
  const result = await ordersService.setOrderReview(auth, orderId, body.rating, body.comment ?? null);
  // Push a refresh to the order's room so the customer's tracking screen shows
  // the updated rating without waiting for its polling interval.
  emitOrderStatus(orderId, { status: result.status, orderId, timestamp: new Date().toISOString() });
  ok(res, result);
}
