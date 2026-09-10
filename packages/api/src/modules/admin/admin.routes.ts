import { operationsHandler } from './operations.controller';
import { notificationAuditHandler } from '../admin/notification-audit.controller';
import { updatePlatformSettingsHandler } from '../platform/platform.controller';
import { Router } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize } from '../../middleware/authenticate';
import { adminStatsHandler, adminCreateStoreHandler, adminCreateCaptainHandler } from './admin.controller';
import {
  adminDeleteDriverHandler,
  adminDeleteStoreHandler,
  adminDeleteUserHandler,
} from '../auth/auth.controller';

/** Admin-only dashboards and aggregates. */
export const adminRouter: Router = Router();

adminRouter.use(authenticate, authorize(UserRole.ADMIN));

adminRouter.get('/stats', asyncHandler(adminStatsHandler));
adminRouter.post('/stores', asyncHandler(adminCreateStoreHandler));
adminRouter.post('/captains', asyncHandler(adminCreateCaptainHandler));
adminRouter.delete('/stores/:id', asyncHandler(adminDeleteStoreHandler));
adminRouter.delete('/drivers/:id', asyncHandler(adminDeleteDriverHandler));
adminRouter.delete('/users/:userId', asyncHandler(adminDeleteUserHandler));
adminRouter.patch('/settings/pricing', asyncHandler(updatePlatformSettingsHandler));

adminRouter.get('/notifications', asyncHandler(notificationAuditHandler));

adminRouter.get('/operations', asyncHandler(operationsHandler));
