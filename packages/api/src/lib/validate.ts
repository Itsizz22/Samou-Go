import type { ZodTypeAny, output } from 'zod';
import { ZodError } from 'zod';
import type { ApiFieldError } from '@samou-go/shared-types';
import { validationError } from './http-error';

export function zodIssuesToFieldErrors(error: ZodError): ApiFieldError[] {
  return error.issues.map(issue => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Parse a request body / query / params against a schema, converting a Zod
 * failure into a 422 the client can render field-by-field.
 *
 * Generic over the schema rather than over a single `T`, because schemas that
 * use `.default()` or `.transform()` have an input type that differs from their
 * output type — `output<S>` is what the caller actually gets back.
 */
export function parseWith<S extends ZodTypeAny>(schema: S, payload: unknown): output<S> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw validationError(zodIssuesToFieldErrors(result.error));
  }
  return result.data as output<S>;
}
