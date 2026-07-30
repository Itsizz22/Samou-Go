import type { Request, Response } from 'express';
import { ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import {
  productListQuerySchema,
  storeIdParamsSchema,
  storeListQuerySchema,
} from './stores.schemas';
import * as storesService from './stores.service';

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
