import type { Request, Response } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { created, ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { forbidden } from '../../lib/http-error';
import { requireAuth } from '../../middleware/authenticate';
import {
  categoryIdParamsSchema,
  createCategorySchema,
  createProductSchema,
  productIdParamsSchema,
  productListQuerySchema,
  storeIdParamsSchema,
  storeListQuerySchema,
  updateCategorySchema,
  updateProductSchema,
  updateStoreRecommendationSchema,
  updateStoreSchema,
} from './stores.schemas';
import * as storesService from './stores.service';

/* ---------------------------------------------------------------------------
 * Public read-only
 * ------------------------------------------------------------------------- */

/** GET /api/v1/stores */
export async function listStoresHandler(req: Request, res: Response): Promise<void> {
  const query = parseWith(storeListQuerySchema, req.query);
  ok(res, await storesService.listStores(query, req.auth ?? null));
}

/** GET /api/v1/stores/mine — the authenticated manager's own stores. */
export async function listMyStoresHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  ok(res, await storesService.listManagedStores(auth.sub));
}

/** GET /api/v1/stores/:storeId */
export async function getStoreHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = parseWith(storeIdParamsSchema, req.params);
  ok(res, await storesService.getStoreWithCatalogue(storeId));
}

/**
 * GET /api/v1/stores/:storeId/full
 * Returns all products including unavailable ones.
 * Requires STORE_MANAGER (own store) or ADMIN.
 */
export async function getStoreFullHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { storeId } = parseWith(storeIdParamsSchema, req.params);
  await storesService.assertStoreAccess(storeId, auth.sub, auth.role);
  ok(res, await storesService.getStoreWithFullCatalogue(storeId));
}

/** GET /api/v1/stores/:storeId/products */
export async function listStoreProductsHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = parseWith(storeIdParamsSchema, req.params);
  const query = parseWith(productListQuerySchema, req.query);
  ok(res, await storesService.listStoreProducts(storeId, query));
}

/* ---------------------------------------------------------------------------
 * Write operations — STORE_MANAGER (own store) or ADMIN
 * ------------------------------------------------------------------------- */

/** PATCH /api/v1/stores/:storeId */
export async function updateStoreHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { storeId } = parseWith(storeIdParamsSchema, req.params);
  await storesService.assertStoreAccess(storeId, auth.sub, auth.role);
  const body = parseWith(updateStoreSchema, req.body);
  // `isApproved` publishes the store to the public catalogue — admin-only.
  // A manager reaching for it here must instead go through the dedicated
  // `PATCH /stores/:storeId/approve` route, which is gated to ADMIN.
  if (auth.role !== UserRole.ADMIN && body.isApproved !== undefined) {
    throw forbidden('اعتماد المتجر مسموح للمشرف فقط / Store approval is admin-only');
  }
  ok(res, await storesService.updateStore(storeId, body));
}

/** PATCH /api/v1/stores/:storeId/approve — ADMIN only, publishes the store. */
export async function approveStoreHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  if (auth.role !== UserRole.ADMIN) throw forbidden();
  const { storeId } = parseWith(storeIdParamsSchema, req.params);
  ok(res, await storesService.approveStore(storeId));
}

/** PATCH /api/v1/stores/:storeId/recommend — ADMIN only, flags the badge. */
export async function updateStoreRecommendationHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  if (auth.role !== UserRole.ADMIN) throw forbidden();
  const { storeId } = parseWith(storeIdParamsSchema, req.params);
  const body = parseWith(updateStoreRecommendationSchema, req.body);
  ok(res, await storesService.setStoreRecommended(storeId, body.isRecommended));
}

/** POST /api/v1/stores/:storeId/products */
export async function createProductHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { storeId } = parseWith(storeIdParamsSchema, req.params);
  await storesService.assertStoreAccess(storeId, auth.sub, auth.role);
  const body = parseWith(createProductSchema, req.body);
  created(res, await storesService.createProduct(storeId, body));
}

/** PATCH /api/v1/stores/:storeId/products/:productId */
export async function updateProductHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { storeId, productId } = parseWith(productIdParamsSchema, req.params);
  await storesService.assertStoreAccess(storeId, auth.sub, auth.role);
  const body = parseWith(updateProductSchema, req.body);
  ok(res, await storesService.updateProduct(storeId, productId, body));
}

/** DELETE /api/v1/stores/:storeId/products/:productId — soft-deactivates */
export async function deleteProductHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { storeId, productId } = parseWith(productIdParamsSchema, req.params);
  await storesService.assertStoreAccess(storeId, auth.sub, auth.role);
  ok(res, await storesService.deactivateProduct(storeId, productId));
}

/** POST /api/v1/stores/:storeId/categories */
export async function createCategoryHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { storeId } = parseWith(storeIdParamsSchema, req.params);
  await storesService.assertStoreAccess(storeId, auth.sub, auth.role);
  const body = parseWith(createCategorySchema, req.body);
  created(res, await storesService.createCategory(storeId, body));
}

/** PATCH /api/v1/stores/:storeId/categories/:categoryId */
export async function updateCategoryHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { storeId, categoryId } = parseWith(categoryIdParamsSchema, req.params);
  await storesService.assertStoreAccess(storeId, auth.sub, auth.role);
  const body = parseWith(updateCategorySchema, req.body);
  ok(res, await storesService.updateCategory(storeId, categoryId, body));
}

/** DELETE /api/v1/stores/:storeId/categories/:categoryId */
export async function deleteCategoryHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { storeId, categoryId } = parseWith(categoryIdParamsSchema, req.params);
  await storesService.assertStoreAccess(storeId, auth.sub, auth.role);
  ok(res, await storesService.deleteCategory(storeId, categoryId));
}
