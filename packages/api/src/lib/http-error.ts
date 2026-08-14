import type { ApiFieldError } from '@samou-go/shared-types';

/**
 * An error the client is allowed to see. Anything thrown that is NOT an
 * `HttpError` is treated as a bug and reported as a generic 500 — see
 * `middleware/error-handler.ts`.
 *
 * Messages are bilingual (Arabic first) because they surface directly in the
 * RTL UI.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: ApiFieldError[] | undefined;

  constructor(statusCode: number, code: string, message: string, details?: ApiFieldError[]) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, HttpError);
  }
}

export const badRequest = (message: string, details?: ApiFieldError[]): HttpError =>
  new HttpError(400, 'BAD_REQUEST', message, details);

export const validationError = (details: ApiFieldError[]): HttpError =>
  new HttpError(422, 'VALIDATION_ERROR', 'بيانات غير صالحة / Invalid request body', details);

export const unauthorized = (
  message = 'يلزم تسجيل الدخول / Authentication required'
): HttpError => new HttpError(401, 'UNAUTHORIZED', message);

export const forbidden = (
  message = 'لا تملك صلاحية لهذا الإجراء / You are not allowed to perform this action'
): HttpError => new HttpError(403, 'FORBIDDEN', message);

export const notFound = (message = 'غير موجود / Not found'): HttpError =>
  new HttpError(404, 'NOT_FOUND', message);

export const conflict = (message: string): HttpError => new HttpError(409, 'CONFLICT', message);

export const unprocessable = (code: string, message: string): HttpError =>
  new HttpError(422, code, message);

/**
 * A caller stepped outside a state machine — invalid transition, unchanged
 * status, closed order, closed cancel window. These are bad *requests* (400),
 * not payload-shape problems (422): the body parsed fine, the state didn't.
 */
export const badState = (code: string, message: string): HttpError =>
  new HttpError(400, code, message);

export const tooMany = (
  code: string,
  message: string,
  /** Seconds the caller should wait before retrying. Surfaced in Retry-After. */
  retryAfterSeconds?: number
): HttpError => {
  const error = new HttpError(429, code, message);
  if (retryAfterSeconds !== undefined) {
    (error as HttpError & { retryAfterSeconds?: number }).retryAfterSeconds = retryAfterSeconds;
  }
  return error;
};

export const payloadTooLarge = (
  message = 'الملف أكبر من الحد المسموح / File exceeds the upload limit'
): HttpError => new HttpError(413, 'PAYLOAD_TOO_LARGE', message);
