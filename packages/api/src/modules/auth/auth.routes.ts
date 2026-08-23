import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import {
  authenticate,
  optionalAuthenticate,
} from "../../middleware/authenticate";
import { authLimiter } from "../../middleware/rate-limit";
import * as controller from "./auth.controller";

export const authRouter: Router = Router();

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
