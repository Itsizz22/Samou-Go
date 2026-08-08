import { Router } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize } from '../../middleware/authenticate';
import { verifyCaptainHandler } from '../auth/auth.controller';

/**
 * Admin-only captain management.
 * All routes require a valid ADMIN token.
 */
export const captainsRouter: Router = Router();

captainsRouter.use(authenticate, authorize(UserRole.ADMIN));

captainsRouter.patch('/:captainId/verify', asyncHandler(verifyCaptainHandler));
