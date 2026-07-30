import type { Response } from 'express';
import type { ApiSuccess } from '@samou-go/shared-types';

/** Every successful response goes out in the same envelope. */
export function ok<T>(res: Response, data: T, statusCode = 200): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return res.status(statusCode).json(body);
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}
