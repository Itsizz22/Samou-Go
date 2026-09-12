import type { Request, Response } from 'express';
import { ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { requireAuth } from '../../middleware/authenticate';
import { sendPushToUser } from '../../lib/push';
import { prisma } from '../../lib/prisma';
import * as customRequestsService from './custom-requests.service';
import {
  createCustomRequestSchema,
  customRequestIdParamsSchema,
  customRequestListQuerySchema,
  offerCustomRequestSchema,
  respondCustomRequestSchema,
} from './custom-requests.schemas';

/** POST /api/v1/customer/custom-requests */
export async function createCustomRequestHandler(
  req: Request,
  res: Response
): Promise<void> {
  const auth = requireAuth(req);
  const body = parseWith(createCustomRequestSchema, req.body);
  const result = await customRequestsService.createCustomRequest(auth.sub, body);

  // Push: notify the store manager of the new custom request.
  void (async () => {
    try {
      const store = await prisma.store.findUnique({
        where: { id: body.storeId },
        select: { managerId: true, nameAr: true },
      });
      if (store) {
        await sendPushToUser(store.managerId, {
          title: result.isPrescription ? 'وصفة جديدة للصيدلية' : 'طلب مخصص جديد ✨',
          body: `طلب جديد إلى ${store.nameAr}، افتح التطبيق لمراجعته`,
          data: { customRequestId: result.id, screen: 'custom-requests', audience: 'store', storeId: result.storeId },
        });
      }
    } catch {
      // Push failure must never break the custom request flow.
    }
  })();

  ok(res, result);
}

/** GET /api/v1/customer/custom-requests */
export async function listCustomerRequestsHandler(
  req: Request,
  res: Response
): Promise<void> {
  const auth = requireAuth(req);
  const query = parseWith(customRequestListQuerySchema, req.query);
  ok(res, await customRequestsService.listCustomerRequests(auth.sub, query));
}

/** PATCH /api/v1/customer/custom-requests/:id/respond */
export async function respondToCustomRequestHandler(
  req: Request,
  res: Response
): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseWith(customRequestIdParamsSchema, req.params);
  const body = parseWith(respondCustomRequestSchema, req.body);
  const previous = await prisma.customRequest.findUnique({ where: { id }, select: { orderId: true } });
  const result = await customRequestsService.respondToCustomRequest(auth.sub, id, body);
  if (previous?.orderId && previous.orderId === result.orderId) { ok(res, result); return; }

  // Push: notify the store manager when the customer accepts or rejects.
  void (async () => {
    try {
      const store = await prisma.store.findUnique({
        where: { id: result.storeId },
        select: { managerId: true, dedicatedCaptains: { select: { id: true } } },
      });
      if (store) {
        const actionText = body.action === 'ACCEPT' ? 'قبل العرض ✅' : 'رفض العرض ❌';
        await sendPushToUser(store.managerId, {
          title: `طلب مخصص — ${actionText}`,
          body: `العميل ${body.action === 'ACCEPT' ? 'قبل' : 'رفض'} عرض السعر على الطلب المخصص`,
          data: result.orderId ? { orderId: result.orderId, screen: 'order', type: 'NEW_ORDER', storeId: result.storeId } : { customRequestId: id, screen: 'custom-requests', audience: 'store', storeId: result.storeId },
        }, result.orderId ? { dataOnly: true } : undefined);
        // The converted order is PENDING; captain notification follows store acceptance.
      }
    } catch {
      // Push failure must never break the response flow.
    }
  })();

  ok(res, result);
}

/** POST /api/v1/customer/custom-requests/:id/cancel */
export async function cancelCustomerRequestHandler(
  req: Request,
  res: Response
): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseWith(customRequestIdParamsSchema, req.params);
  ok(res, await customRequestsService.cancelCustomerRequest(auth.sub, id));
}

/** GET /api/v1/store/custom-requests */
export async function listStoreRequestsHandler(
  req: Request,
  res: Response
): Promise<void> {
  const auth = requireAuth(req);
  const query = parseWith(customRequestListQuerySchema, req.query);
  ok(res, await customRequestsService.listStoreRequests(auth.sub, auth.role, query));
}

/** POST /api/v1/store/custom-requests/:id/offer */
export async function offerPriceOnCustomRequestHandler(
  req: Request,
  res: Response
): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseWith(customRequestIdParamsSchema, req.params);
  const body = parseWith(offerCustomRequestSchema, req.body);
  const result = await customRequestsService.offerPriceOnCustomRequest(auth, id, body);

  // Push: notify the customer that the store quoted a price.
  void (async () => {
    try {
      await sendPushToUser(result.customer.id, {
        title: 'عرض سعر جديد 💰',
        body: result.isPrescription ? 'عرض سعر الصيدلية جاهز. افتح التطبيق للاطلاع والقبول أو الرفض.' : `عرض السعر: ₪${body.offeredPrice.toFixed(2)} على طلبك المخصص`,
        data: { customRequestId: id, screen: 'custom-requests', audience: 'customer' },
      });
    } catch {
      // Push failure must never break the offer flow.
    }
  })();

  ok(res, result);
}

/** POST /api/v1/store/custom-requests/:id/cancel */
export async function cancelStoreRequestHandler(
  req: Request,
  res: Response
): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseWith(customRequestIdParamsSchema, req.params);
  ok(res, await customRequestsService.cancelStoreRequest(auth, id));
}