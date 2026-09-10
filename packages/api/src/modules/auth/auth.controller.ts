import type { Request, Response } from "express";
import { UserRole } from "@samou-go/shared-types";
import { created, ok } from "../../lib/respond";
import { parseWith } from "../../lib/validate";
import { forbidden } from "../../lib/http-error";
import { requireAuth } from "../../middleware/authenticate";
import { revokeRefreshToken, findUserIdForRefreshToken } from "./refresh-token";
import * as devicesService from "../devices/devices.service";
import {
  adminIdParamsSchema,
  adminUpdateUserSchema,
  captainIdParamsSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  logoutSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  registerSchema,
  setAvailabilitySchema,
  updateMyLocationSchema,
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

/** PUT /api/v1/users/me/location — the caller persists their own GPS point. */
export async function updateMyLocationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireAuth(req);
  const body = parseWith(updateMyLocationSchema, req.body);
  ok(res, await authService.updateMyLocation(auth.sub, body));
}

/**
 * POST /api/v1/auth/logout
 * Stateless JWT access tokens are dropped client-side. The refresh token, if
 * the client sends one, is revoked server-side so a leaked token cannot be
 * replayed after sign-out. When the client also sends `deviceToken`, ONLY that
 * device's push token is removed (selective logout) — the user's other devices
 * stay signed in and remain reachable by push. Both operations are scoped to
 * the refresh token's owner, so a logout can never unregister another user's
 * device.
 */
export async function logoutHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { refreshToken, deviceToken } = parseWith(logoutSchema, req.body);
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
    // Selective logout: remove exactly the device that is signing out, still
    // attributed to this session's account. Without a matching refresh token
    // (schema-refined) we never attempt an unscoped delete.
    if (deviceToken) {
      const userId = await findUserIdForRefreshToken(refreshToken);
      if (userId) {
        await devicesService.unregisterDeviceToken(userId, { token: deviceToken });
      }
    }
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

/* ---------------------------------------------------------------------------
 * Admin deletion
 * ------------------------------------------------------------------------- */

/** DELETE /api/v1/admin/stores/:id — closes the store and its owner account. */
export async function adminDeleteStoreHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (requireAuth(req).role !== UserRole.ADMIN) throw forbidden();
  const { id } = parseWith(adminIdParamsSchema, req.params);
  ok(res, await authService.adminDeleteStore(id));
}

/** DELETE /api/v1/admin/drivers/:id — removes the driver and profile data. */
export async function adminDeleteDriverHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (requireAuth(req).role !== UserRole.ADMIN) throw forbidden();
  const { id } = parseWith(adminIdParamsSchema, req.params);
  ok(res, await authService.adminDeleteDriver(id));
}

/** DELETE /api/v1/admin/users/:id — safely deactivates a user account. */
export async function adminDeleteUserHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireAuth(req);
  if (auth.role !== UserRole.ADMIN) throw forbidden();
  const { userId } = parseWith(userIdParamsSchema, req.params);
  ok(res, await authService.adminDeleteUser(userId, auth.sub));
}
export async function requestOtpHandler(req: Request, res: Response): Promise<void> {
  const body = parseWith(otpRequestSchema, req.body);
  if (body.purpose === "phone-change") requireAuth(req);
  ok(res, await otpService.requestOtp(body));
}

export async function verifyOtpHandler(req: Request, res: Response): Promise<void> {
  ok(res, await otpService.verifyOtp(parseWith(otpVerifySchema, req.body)));
}
