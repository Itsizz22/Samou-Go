import { prisma } from '../../lib/prisma';
import { ok } from '../../lib/respond';
import { requireAuth } from '../../middleware/authenticate';
import { z } from 'zod';
import { parseWith } from '../../lib/validate';
import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import {
  authenticate,
  optionalAuthenticate,
} from "../../middleware/authenticate";
import { authLimiter } from "../../middleware/rate-limit";
import * as controller from "./auth.controller";

export const authRouter: Router = Router();
authRouter.post("/otp/request", authLimiter, asyncHandler(controller.requestOtpHandler));
authRouter.post("/otp/verify", authLimiter, asyncHandler(controller.verifyOtpHandler));

// `optionalAuthenticate` so an authenticated ADMIN can register staff accounts,
// while an anonymous visitor can still register themselves as a CUSTOMER.
authRouter.post(
  "/register",
  authLimiter,
  optionalAuthenticate,
  asyncHandler(controller.registerHandler),
);
authRouter.post("/login", authLimiter, asyncHandler(controller.loginHandler));
authRouter.post(
  "/password/reset",
  authLimiter,
  asyncHandler(controller.resetPasswordHandler),
);
authRouter.post("/refresh", authLimiter, asyncHandler(controller.refreshHandler));
authRouter.post("/logout", asyncHandler(controller.logoutHandler));
authRouter.get("/me", authenticate, asyncHandler(controller.meHandler));
authRouter.patch(
  "/me",
  authenticate,
  asyncHandler(controller.updateProfileHandler),
);
authRouter.patch(
  "/me/availability",
  authenticate,
  asyncHandler(controller.setAvailabilityHandler),
);

authRouter.get('/me/notifications', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: requireAuth(req).sub }, select: { marketingNotificationsEnabled: true } });
  ok(res, user);
}));
authRouter.patch('/me/notifications', authenticate, asyncHandler(async (req, res) => {
  const body = parseWith(z.object({ marketingNotificationsEnabled: z.boolean() }), req.body);
  ok(res, await prisma.user.update({ where: { id: requireAuth(req).sub }, data: body, select: { marketingNotificationsEnabled: true } }));
}));
