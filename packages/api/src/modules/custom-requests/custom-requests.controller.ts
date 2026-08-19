import type { Request, Response } from 'express';
import { ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { requireAuth } from '../../middleware/authenticate';
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
  ok(res, await customRequestsService.createCustomRequest(auth.sub, body));
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
  ok(res, await customRequestsService.respondToCustomRequest(auth.sub, id, body));
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
  ok(res, await customRequestsService.offerPriceOnCustomRequest(auth, id, body));
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