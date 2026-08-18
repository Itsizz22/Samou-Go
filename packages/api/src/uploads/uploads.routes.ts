import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { badRequest } from '../lib/http-error';
import { noContent, ok } from '../lib/respond';
import { authenticate, requireAuth } from '../middleware/authenticate';
import type { UploadCaller } from './uploads.service';
import { finalizeUpload, presign, removeCurrentImage, removeUpload, storeRaw } from './uploads.service';

function callerOf(req: Request): UploadCaller {
  const auth = requireAuth(req);
  return { userId: auth.sub, role: auth.role };
}

const presignSchema = z.object({
  contentType: z.string().min(1),
  kind: z.enum(['user', 'product', 'store', 'offer']),
  resourceId: z.string().optional(),
  purpose: z.enum(['logo', 'cover']).optional(),
});

const finalizeSchema = z.object({
  key: z.string().min(1),
  kind: z.enum(['user', 'product', 'store', 'offer']),
});

const removeCurrentSchema = z.object({
  kind: z.enum(['user', 'product', 'store', 'offer']),
  resourceId: z.string().optional(),
  purpose: z.enum(['logo', 'cover']).optional(),
});

export const uploadsRouter: Router = Router();

// Every upload route acts on behalf of the signed-in caller.
uploadsRouter.use(authenticate);

uploadsRouter.post(
  '/presign',
  asyncHandler(async (req, res) => {
    const body = presignSchema.parse(req.body);
    const data = await presign(callerOf(req), body);
    ok(res, data, 201);
  })
);

// Raw bytes stream straight through — no JSON parser on this route, so a
// caller-supplied key may contain slashes (`user/<id>/<uuid>.jpg`).
uploadsRouter.put(
  '/raw/*',
  asyncHandler(async (req, res) => {
    const key = (req.params as Record<string, string | undefined>)['0'];
    if (!key) throw badRequest('مفتاح رفع غير صالح / Invalid upload key');
    await storeRaw(key, req, callerOf(req));
    noContent(res);
  })
);

uploadsRouter.post(
  '/finalize',
  asyncHandler(async (req, res) => {
    const body = finalizeSchema.parse(req.body);
    const data = await finalizeUpload(callerOf(req), body.key, body.kind);
    ok(res, data);
  })
);

uploadsRouter.delete(
  '/current',
  asyncHandler(async (req, res) => {
    const body = removeCurrentSchema.parse(req.body);
    await removeCurrentImage(callerOf(req), body.kind, body.resourceId, body.purpose);
    noContent(res);
  })
);

uploadsRouter.delete(
  '/raw/*',
  asyncHandler(async (req, res) => {
    const key = (req.params as Record<string, string | undefined>)['0'];
    if (!key) throw badRequest('مفتاح رفع غير صالح / Invalid upload key');
    await removeUpload(key, callerOf(req));
    noContent(res);
  })
);
