import type { Prisma } from '@prisma/client';

/**
 * PostgreSQL `Decimal(10,2)` arrives as a `Prisma.Decimal`, which `JSON.stringify`
 * renders as a string. Every money field crossing the wire goes through here so
 * the front-ends receive plain numbers — matching `@samou-go/shared-types`.
 */
export function decimalToNumber(
  value: Prisma.Decimal | number | string | null | undefined
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.toNumber();
}
