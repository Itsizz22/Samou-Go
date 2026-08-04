import { Router } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, authorize, optionalAuthenticate } from '../../middleware/authenticate';
import { authLimiter } from '../../middleware/rate-limit';
import * as controller from './auth.controller';

export const authRouter: Router = Router();

// `optionalAuthenticate` so an authenticated ADMIN can register staff accounts,
// while an anonymous visitor can still register themselves as a CUSTOMER.
authRouter.post('/register', authLimiter, optionalAuthenticate, asyncHandler(controller.registerHandler));
authRouter.post('/login', authLimiter, asyncHandler(controller.loginHandler));
authRouter.post('/logout', controller.logoutHandler);
authRouter.get('/me', authenticate, asyncHandler(controller.meHandler));
authRouter.patch('/me', authenticate, asyncHandler(controller.updateProfileHandler));
