import type { Request, Response } from 'express';
import { UserRole } from '@samou-go/shared-types';
import { ok } from '../../lib/respond';
import { forbidden } from '../../lib/http-error';
import { requireAuth } from '../../middleware/authenticate';
import { getAdminStats } from './admin.service';

/** GET /api/v1/admin/stats — the whole dashboard in one round-trip. */
export async function adminStatsHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  // Route-level `authorize(ADMIN)` is the real gate; this guards mis-wiring.
  if (auth.role !== UserRole.ADMIN) throw forbidden();
  ok(res, await getAdminStats());
}
