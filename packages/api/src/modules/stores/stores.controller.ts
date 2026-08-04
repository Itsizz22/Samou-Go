import type { Request, Response } from 'express';
import { created, ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { requireAuth } from '../../middleware/authenticate';
import {
  createProductSchema,
  productIdParamsSchema,
  productListQuerySchema,
  storeIdParamsSchema,
  storeListQuerySchema,
  updateProductSchema,
  updateStoreSchema,
} from './stores.schemas';
import * as storesService from './stores.service';

/* ---------------------------------------------------------------------------
 * Public read-only
 * ------------------------------------------------------------------------- */

/** GET /api/v1/stores */
export async function listStoresHandler(req: Request, res: Response): Promise<void> {
  const query = parseWith(storeListQuerySchema, req.query);
  ok(res, await storesService.listStores(query));
}

/** GET /api/v1/stores/:storeId */
export async function getStoreHandler(req: Request, res: Response): Promise<void> {
  const { storeId } = parseWith(storeIdParamsSchema, req.params);
  ok(res, await storesService.getStoreWithCatalogue(storeId));
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
  ok(res, await storesService.updateStore(storeId, body));
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
