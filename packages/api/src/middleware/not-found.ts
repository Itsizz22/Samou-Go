import type { Request, Response } from 'express';
import type { ApiFailure } from '@samou-go/shared-types';
import { notFound } from '../lib/http-error';

/** Terminal 404 for any path the router did not claim. */
export function notFoundHandler(req: Request, res: Response): void {
  const error = notFound(`المسار غير موجود / No route for ${req.method} ${req.originalUrl}`);
  const body: ApiFailure = {
    success: false,
    error: { code: error.code, message: error.message },
  };
  res.status(error.statusCode).json(body);
}
