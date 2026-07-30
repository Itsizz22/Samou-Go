import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate';
import * as controller from './auth.controller';

export const authRouter: Router = Router();

// `optionalAuthenticate` so an authenticated ADMIN can register staff accounts,
// while an anonymous visitor can still register themselves as a CUSTOMER.
authRouter.post('/register', optionalAuthenticate, asyncHandler(controller.registerHandler));
authRouter.post('/login', asyncHandler(controller.loginHandler));
authRouter.post('/logout', controller.logoutHandler);
authRouter.get('/me', authenticate, asyncHandler(controller.meHandler));
