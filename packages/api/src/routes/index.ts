import { Router } from 'express';
import {
  DELIVERY_FEE_LABEL,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEQUENCE,
  USER_ROLE_LABELS,
} from '@samou-go/shared-types';
import { env } from '../config/env';
import { ok } from '../lib/respond';
import { authRouter } from '../modules/auth/auth.routes';
import { storesRouter } from '../modules/stores/stores.routes';
import { ordersRouter } from '../modules/orders/orders.routes';
import { usersRouter } from '../modules/users/users.routes';
import { captainsRouter } from '../modules/captains/captains.routes';
import { adminRouter } from '../modules/admin/admin.routes';
import { favoritesRouter } from '../modules/favorites/favorites.routes';
import { uploadsRouter } from '../uploads/uploads.routes';
import { platformRouter } from '../modules/platform/platform.routes';

export const apiRouter: Router = Router();

/**
 * GET /api/v1/meta — lets the seven frontends read the live tariff and the
 * status vocabulary instead of hard-coding them a second time.
 */
apiRouter.get('/meta', (_req, res) => {
  ok(res, {
    deliveryFee: {
      ...env.deliveryFeeConfig,
      label: DELIVERY_FEE_LABEL,
    },
    orderStatuses: ORDER_STATUS_SEQUENCE,
    orderStatusLabels: ORDER_STATUS_LABELS,
    userRoleLabels: USER_ROLE_LABELS,
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/stores', storesRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/captains', captainsRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/favorites', favoritesRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/platform', platformRouter);
