import { Router } from "express";
import { UserRole } from "@samou-go/shared-types";
import { asyncHandler } from "../../lib/async-handler";
import {
  authenticate,
  authorize,
  optionalAuthenticate,
} from "../../middleware/authenticate";
import { authLimiter, otpIpLimiter } from "../../middleware/rate-limit";
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
  "/otp/request",
  otpIpLimiter,
  asyncHandler(controller.requestOtpHandler),
);
authRouter.post(
  "/otp/verify",
  otpIpLimiter,
  asyncHandler(controller.verifyOtpHandler),
);
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

/* ---------------------------------------------------------------------------
 * Admin store/captain creation via OTP
 * These routes provision privileged roles (STORE_MANAGER / CAPTAIN) and an
 * auto-approved store, so they must be ADMIN-only — otherwise any phone owner
 * could mint themselves a staff account. `otpIpLimiter` stays as a secondary
 * anti-spam layer on top of the ADMIN gate.
 * ------------------------------------------------------------------------- */

authRouter.post(
  "/admin/stores/otp/request",
  authenticate,
  authorize(UserRole.ADMIN),
  otpIpLimiter,
  asyncHandler(controller.adminCreateStoreOtpRequestHandler),
);
authRouter.post(
  "/admin/stores/otp/verify",
  authenticate,
  authorize(UserRole.ADMIN),
  otpIpLimiter,
  asyncHandler(controller.adminVerifyStoreOtpHandler),
);
authRouter.post(
  "/admin/captains/otp/request",
  authenticate,
  authorize(UserRole.ADMIN),
  otpIpLimiter,
  asyncHandler(controller.adminCreateCaptainOtpRequestHandler),
);
authRouter.post(
  "/admin/captains/otp/verify",
  authenticate,
  authorize(UserRole.ADMIN),
  otpIpLimiter,
  asyncHandler(controller.adminVerifyCaptainOtpHandler),
);
