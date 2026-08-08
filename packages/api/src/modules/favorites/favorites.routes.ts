import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize } from '../../middleware/authenticate';
import { UserRole } from '@samou-go/shared-types';
import * as controller from './favorites.controller';

export const favoritesRouter: Router = Router();

// Favorites are personal to the signed-in customer.
favoritesRouter.use(authenticate, authorize(UserRole.CUSTOMER, UserRole.ADMIN));

favoritesRouter.get('/', asyncHandler(controller.listFavoritesHandler));
favoritesRouter.put('/:storeId', asyncHandler(controller.addFavoriteHandler));
favoritesRouter.delete('/:storeId', asyncHandler(controller.removeFavoriteHandler));
