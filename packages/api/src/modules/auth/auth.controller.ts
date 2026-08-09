import type { Request, Response } from "express";
import { UserRole } from "@samou-go/shared-types";
import { created, ok } from "../../lib/respond";
import { parseWith } from "../../lib/validate";
import { forbidden } from "../../lib/http-error";
import { requireAuth } from "../../middleware/authenticate";
import { revokeRefreshToken } from "./refresh-token";
import {
  adminUpdateUserSchema,
  captainIdParamsSchema,
  loginSchema,
  logoutSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshTokenSchema,
  resetPasswordSchema,
  registerSchema,
  setAvailabilitySchema,
  updateProfileSchema,
  userIdParamsSchema,
  userListQuerySchema,
} from "./auth.schemas";
import * as authService from "./auth.service";
import * as otpService from "./otp.service";

/* ---------------------------------------------------------------------------
 * Auth
 * ------------------------------------------------------------------------- */

/** POST /api/v1/auth/register */
export async function registerHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = parseWith(registerSchema, req.body);
  // `optionalAuthenticate` runs first, so an admin creating staff is recognised.
  const result = await authService.register(body, req.auth?.role);
  created(res, result);
}

/** POST /api/v1/auth/login */
export async function loginHandler(req: Request, res: Response): Promise<void> {
  const body = parseWith(loginSchema, req.body);
  ok(res, await authService.login(body));
}

/** POST /api/v1/auth/otp/request — dispatch a one-time code (rate-limited). */
export async function requestOtpHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = parseWith(otpRequestSchema, req.body);
  ok(res, await otpService.requestOtp(body));
}

/** POST /api/v1/auth/otp/verify — exchange the code for a session. */
export async function verifyOtpHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = parseWith(otpVerifySchema, req.body);
  ok(res, await otpService.verifyOtp(body));
}

/** POST /api/v1/auth/password/reset */
export async function resetPasswordHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = parseWith(resetPasswordSchema, req.body);
  await otpService.resetPassword(body);
  ok(res, { message: "تم تحديث كلمة المرور / Password updated" });
}

/** POST /api/v1/auth/refresh — rotate the refresh token and mint a new pair. */
export async function refreshHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = parseWith(refreshTokenSchema, req.body);
  ok(res, await authService.refreshSession(body));
}

/** GET /api/v1/auth/me */
export async function meHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  ok(res, await authService.getProfile(auth.sub));
}

/** PATCH /api/v1/auth/me */
export async function updateProfileHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireAuth(req);
  const body = parseWith(updateProfileSchema, req.body);
  ok(res, await authService.updateProfile(auth.sub, body));
}

/** PATCH /api/v1/auth/me/availability — captain toggles their online state. */
export async function setAvailabilityHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireAuth(req);
  const body = parseWith(setAvailabilitySchema, req.body);
  ok(res, await authService.setAvailability(auth.sub, body));
}

/**
 * POST /api/v1/auth/logout
 * Stateless JWT access tokens are dropped client-side. The refresh token, if
 * the client sends one, is revoked server-side so a leaked token cannot be
 * replayed after sign-out.
 */
export async function logoutHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { refreshToken } = parseWith(logoutSchema, req.body);
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
  ok(res, { message: "تم تسجيل الخروج / Signed out" });
}

/* ---------------------------------------------------------------------------
 * Admin user management
 * ------------------------------------------------------------------------- */

/** GET /api/v1/users */
export async function listUsersHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const query = parseWith(userListQuerySchema, req.query);
  ok(res, await authService.listUsers(query));
}

/** PATCH /api/v1/users/:userId */
export async function updateUserHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireAuth(req);
  // Double-check: route-level `authorize(ADMIN)` should already block others,
  // but an explicit guard here prevents any future mis-wiring.
  if (auth.role !== UserRole.ADMIN) throw forbidden();
  const { userId } = parseWith(userIdParamsSchema, req.params);
  const body = parseWith(adminUpdateUserSchema, req.body);
  ok(res, await authService.adminUpdateUser(userId, body));
}

/** PATCH /api/v1/captains/:captainId/verify */
export async function verifyCaptainHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireAuth(req);
  if (auth.role !== UserRole.ADMIN) throw forbidden();
  const { captainId } = parseWith(captainIdParamsSchema, req.params);
  ok(res, await authService.verifyCaptain(captainId));
}
