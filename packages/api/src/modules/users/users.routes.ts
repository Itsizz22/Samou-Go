import { Router } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize } from '../../middleware/authenticate';
import * as controller from '../auth/auth.controller';

/**
 * Admin-only user management.
 * All routes require a valid ADMIN token.
 */
export const usersRouter: Router = Router();

usersRouter.use(authenticate, authorize(UserRole.ADMIN));

usersRouter.get('/', asyncHandler(controller.listUsersHandler));
usersRouter.patch('/:userId', asyncHandler(controller.updateUserHandler));
