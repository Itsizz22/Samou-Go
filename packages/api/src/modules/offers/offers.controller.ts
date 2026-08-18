import type { Request, Response } from 'express';
import { ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { requireAuth } from '../../middleware/authenticate';
import * as offersService from './offers.service';
import {
  createOfferSchema,
  updateOfferSchema,
} from './offers.schemas';

/* ---------------------------------------------------------------------------
 * Public
 * ------------------------------------------------------------------------- */

/** GET /stores/:storeId/offers — active offers for a single store. */
export async function listStoreOffersHandler(
  req: Request,
  res: Response
): Promise<void> {
  const storeId = req.params.storeId as string;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const result = await offersService.listActiveOffersForStore(storeId, page, pageSize);
  ok(res, result);
}

/** GET /offers — home-screen feed across all approved stores. */
export async function listAllOffersHandler(
  req: Request,
  res: Response
): Promise<void> {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const result = await offersService.listActiveOffersAllStores(page, pageSize);
  ok(res, result);
}

/* ---------------------------------------------------------------------------
 * Manager
 * ------------------------------------------------------------------------- */

/** GET /stores/:storeId/offers/manage — all offers (incl. inactive). */
export async function listMyStoreOffersHandler(
  req: Request,
  res: Response
): Promise<void> {
  const storeId = req.params.storeId as string;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const result = await offersService.listAllOffersForStore(storeId, page, pageSize);
  ok(res, result);
}

/** POST /stores/:storeId/offers — create a new offer. */
export async function createOfferHandler(
  req: Request,
  res: Response
): Promise<void> {
  const storeId = req.params.storeId as string;
  const auth = requireAuth(req);
  const body = parseWith(createOfferSchema, req.body);
  const result = await offersService.createOffer(storeId, body, auth.sub, auth.role);
  ok(res, result);
}

/** PATCH /stores/:storeId/offers/:offerId — update an offer. */
export async function updateOfferHandler(
  req: Request,
  res: Response
): Promise<void> {
  const storeId = req.params.storeId as string;
  const offerId = req.params.offerId as string;
  const auth = requireAuth(req);
  const body = parseWith(updateOfferSchema, req.body);
  const result = await offersService.updateOffer(storeId, offerId, body, auth.sub, auth.role);
  ok(res, result);
}

/** PATCH /stores/:storeId/offers/:offerId/toggle — flip active state. */
export async function toggleOfferHandler(
  req: Request,
  res: Response
): Promise<void> {
  const storeId = req.params.storeId as string;
  const offerId = req.params.offerId as string;
  const auth = requireAuth(req);
  const result = await offersService.toggleOffer(storeId, offerId, auth.sub, auth.role);
  ok(res, result);
}

/** DELETE /stores/:storeId/offers/:offerId — remove an offer. */
export async function deleteOfferHandler(
  req: Request,
  res: Response
): Promise<void> {
  const storeId = req.params.storeId as string;
  const offerId = req.params.offerId as string;
  const auth = requireAuth(req);
  await offersService.deleteOffer(storeId, offerId, auth.sub, auth.role);
  ok(res, { deleted: true });
}