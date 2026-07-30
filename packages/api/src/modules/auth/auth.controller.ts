import type { Request, Response } from 'express';
import { created, ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { requireAuth } from '../../middleware/authenticate';
import { loginSchema, registerSchema } from './auth.schemas';
import * as authService from './auth.service';

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

/**
 * POST /api/v1/auth/logout
 * Stateless JWT: there is nothing to revoke server-side yet. The client drops
 * the token. Kept as an endpoint so adding a deny-list later is not a breaking
 * change for the seven front-ends.
 */
export function logoutHandler(_req: Request, res: Response): void {
  ok(res, { message: 'تم تسجيل الخروج / Signed out' });
}
