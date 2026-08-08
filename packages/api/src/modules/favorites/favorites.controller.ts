import type { Request, Response } from 'express';
import { ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { requireAuth } from '../../middleware/authenticate';
import { favoriteStoreIdParamsSchema } from './favorites.schemas';
import * as favoritesService from './favorites.service';

/** GET /api/v1/favorites */
export async function listFavoritesHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  ok(res, await favoritesService.listFavorites(auth.sub));
}

/** PUT /api/v1/favorites/:storeId — idempotent add. */
export async function addFavoriteHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { storeId } = parseWith(favoriteStoreIdParamsSchema, req.params);
  await favoritesService.addFavorite(auth.sub, storeId);
  ok(res, { favorited: true });
}

/** DELETE /api/v1/favorites/:storeId — idempotent remove. */
export async function removeFavoriteHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { storeId } = parseWith(favoriteStoreIdParamsSchema, req.params);
  await favoritesService.removeFavorite(auth.sub, storeId);
  ok(res, { favorited: false });
}
