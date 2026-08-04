import type { Request, Response } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { created, ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { forbidden } from '../../lib/http-error';
import { requireAuth } from '../../middleware/authenticate';
import {
  adminUpdateUserSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
  userListQuerySchema,
} from './auth.schemas';
import * as authService from './auth.service';

/* ---------------------------------------------------------------------------
 * Auth
 * ------------------------------------------------------------------------- */

/** POST /api/v1/auth/register */
export async function registerHandler(req: Request, res: Response): Promise<void> {
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

/** GET /api/v1/auth/me */
export async function meHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  ok(res, await authService.getProfile(auth.sub));
}

/** PATCH /api/v1/auth/me */
export async function updateProfileHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const body = parseWith(updateProfileSchema, req.body);
  ok(res, await authService.updateProfile(auth.sub, body));
}

/**
 * POST /api/v1/auth/logout
 * Stateless JWT: there is nothing to revoke server-side yet. The client drops
 * the token. Kept as an endpoint so adding a deny-list later is not a breaking
 * change for the seven front-ends.
 */
export function logoutHandler(_req: Request, res: Response): void {
  ok(res, { message: 'تم تسجيل الخروج / Signed out' });
}

/* ---------------------------------------------------------------------------
 * Admin user management
 * ------------------------------------------------------------------------- */

/** GET /api/v1/users */
export async function listUsersHandler(req: Request, res: Response): Promise<void> {
  const query = parseWith(userListQuerySchema, req.query);
  ok(res, await authService.listUsers(query));
}

/** PATCH /api/v1/users/:userId */
export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  // Double-check: route-level `authorize(ADMIN)` should already block others,
  // but an explicit guard here prevents any future mis-wiring.
  if (auth.role !== UserRole.ADMIN) throw forbidden();
  const { userId } = req.params as { userId: string };
  const body = parseWith(adminUpdateUserSchema, req.body);
  ok(res, await authService.adminUpdateUser(userId, body));
}
