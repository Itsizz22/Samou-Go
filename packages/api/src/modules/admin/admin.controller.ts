import type { Request, Response } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { created, ok } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { forbidden } from '../../lib/http-error';
import { requireAuth } from '../../middleware/authenticate';
import { getAdminStats } from './admin.service';
import { adminCreateCaptainSchema, adminCreateStoreSchema } from '../auth/auth.schemas';
import { adminCreateCaptain, adminCreateStore } from '../auth/auth.service';

/** GET /api/v1/admin/stats — the whole dashboard in one round-trip. */
export async function adminStatsHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  // Route-level `authorize(ADMIN)` is the real gate; this guards mis-wiring.
  if (auth.role !== UserRole.ADMIN) throw forbidden();
  ok(res, await getAdminStats());
}

/** POST /api/v1/admin/stores — admin creates a store + its manager account. */
export async function adminCreateStoreHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  if (auth.role !== UserRole.ADMIN) throw forbidden();
  const body = parseWith(adminCreateStoreSchema, req.body);
  created(res, await adminCreateStore(body));
}

/** POST /api/v1/admin/captains — admin creates a new delivery captain. */
export async function adminCreateCaptainHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  if (auth.role !== UserRole.ADMIN) throw forbidden();
  const body = parseWith(adminCreateCaptainSchema, req.body);
  created(res, await adminCreateCaptain(body));
}