import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseWith } from './validate';
import { HttpError } from './http-error';
import { loginSchema, userIdParamsSchema } from '../modules/auth/auth.schemas';
import { createOrderSchema } from '../modules/orders/orders.schemas';

/**
 * Every incoming body, query and route param must be validated against a Zod
 * schema. `parseWith` is the single chokepoint: an invalid payload becomes a
 * 422 `VALIDATION_ERROR` with per-field details the UI can render.
 */

function expectValidationError(fn: () => unknown, expectedPaths: string[]) {
  try {
    fn();
    throw new Error('expected a validation HttpError, but parseWith resolved');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    const http = error as HttpError;
    expect(http.statusCode).toBe(422);
    expect(http.code).toBe('VALIDATION_ERROR');
    expect(http.details?.map(d => d.path)).toEqual(expect.arrayContaining(expectedPaths));
  }
}

describe('parseWith body validation', () => {
  it('rejects an invalid phone number with a field-level error', () => {
    expectValidationError(
      () => parseWith(loginSchema, { phone: '123', password: 'secret1' }),
      ['phone']
    );
  });

  it('rejects multiple bad fields at once', () => {
    expectValidationError(
      () => parseWith(loginSchema, { phone: '', password: '' }),
      ['phone', 'password']
    );
  });

  it('rejects a non-object payload', () => {
    expectValidationError(() => parseWith(loginSchema, 'not an object'), []);
  });

  it('returns the parsed (normalised) value on success', () => {
    const body = parseWith(loginSchema, { phone: '+970599000001', password: 'secret1' });
    expect(body.phone).toBe('0599000001');
    expect(body.password).toBe('secret1');
  });
});

describe('parseWith route param validation', () => {
  it('rejects an empty userId route param', () => {
    expectValidationError(() => parseWith(userIdParamsSchema, { userId: '' }), ['userId']);
  });

  it('accepts a well-formed userId', () => {
    expect(parseWith(userIdParamsSchema, { userId: 'user_abc123' })).toEqual({ userId: 'user_abc123' });
  });
});

describe('client-supplied identity is never trusted', () => {
  it('strips customerId and role from an order body — identity comes from the JWT', () => {
    const parsed = parseWith(createOrderSchema, {
      storeId: 'store-1',
      items: [{ productId: 'p-1', quantity: 1 }],
      customerAddressText: 'حارة الرأس',
      customerId: 'attacker-supplied-user-id',
      role: 'ADMIN',
    });

    expect(parsed).not.toHaveProperty('customerId');
    expect(parsed).not.toHaveProperty('role');
    expect(parsed).toMatchObject({ storeId: 'store-1', customerAddressText: 'حارة الرأس' });
  });

  it('applies Zod defaults only for absent keys, not wrong types', () => {
    const withDefault = z.object({ page: z.number().default(1) });

    // Missing key → default applies.
    expect(parseWith(withDefault, {})).toEqual({ page: 1 });

    // Present-but-wrong type still fails — the schema does not mask garbage.
    expectValidationError(() => parseWith(withDefault, { page: 'two' }), ['page']);
  });
});
