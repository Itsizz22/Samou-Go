import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { ApiFailure } from '@samou-go/shared-types';
import { env } from '../config/env';
import { HttpError } from '../lib/http-error';
import { zodIssuesToFieldErrors } from '../lib/validate';

interface Normalised {
  statusCode: number;
  code: string;
  message: string;
  details?: ApiFailure['error']['details'];
  /** `true` when this is a bug rather than a client mistake — worth logging. */
  unexpected: boolean;
}

function normalise(error: unknown): Normalised {
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      unexpected: false,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'بيانات غير صالحة / Invalid request body',
      details: zodIssuesToFieldErrors(error),
      unexpected: false,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target = error.meta?.['target'];
        const field = Array.isArray(target) ? target.join(', ') : String(target ?? 'field');
        return {
          statusCode: 409,
          code: 'DUPLICATE_VALUE',
          message: `القيمة مستخدمة مسبقاً / Already in use: ${field}`,
          unexpected: false,
        };
      }
      case 'P2025':
        return {
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'السجل غير موجود / Record not found',
          unexpected: false,
        };
      case 'P2003':
        return {
          statusCode: 422,
          code: 'INVALID_REFERENCE',
          message: 'مرجع غير صالح / Referenced record does not exist',
          unexpected: false,
        };
      default:
        return {
          statusCode: 400,
          code: `PRISMA_${error.code}`,
          message: 'خطأ في قاعدة البيانات / Database request failed',
          unexpected: true,
        };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: 400,
      code: 'PRISMA_VALIDATION_ERROR',
      message: 'استعلام غير صالح / Malformed database query',
      unexpected: true,
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'قاعدة البيانات غير متاحة / Database unavailable',
      unexpected: true,
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'حدث خطأ غير متوقع / Something went wrong',
    unexpected: true,
  };
}

/**
 * The single exit point for every failure. Must be the LAST `app.use`, and must
 * keep all four parameters — Express identifies error middleware by arity.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const { statusCode, code, message, details, unexpected } = normalise(error);

  if (unexpected) {
    // eslint-disable-next-line no-console
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  const body: ApiFailure = {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };

  // Stacks are for the server log and local debugging, never for production JSON.
  if (!env.isProduction && unexpected && error instanceof Error && error.stack) {
    (body.error as Record<string, unknown>)['stack'] = error.stack.split('\n');
  }

  res.status(statusCode).json(body);
}
