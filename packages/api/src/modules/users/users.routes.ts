import { Router } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize } from '../../middleware/authenticate';
import * as controller from '../auth/auth.controller';

/**
 * Self-service routes come FIRST, outside the admin gate below.
 * The caller may only ever write their OWN location.
 */
export const usersRouter: Router = Router();

usersRouter.put(
  '/me/location',
  authenticate,
  asyncHandler(controller.updateMyLocationHandler)
);

/**
 * Admin-only user management.
 * All routes below require a valid ADMIN token.
 */
usersRouter.use(authenticate, authorize(UserRole.ADMIN));

usersRouter.get('/', asyncHandler(controller.listUsersHandler));
usersRouter.patch('/:userId', asyncHandler(controller.updateUserHandler));
