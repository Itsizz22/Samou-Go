/**
 * Human-facing order references: `SQ-260728-A3F2`
 * — `SQ` Samou Quick, `YYMMDD`, then a 4-char unambiguous alphanumeric code.
 *
 * The sequence comes from `DailyOrderSequence`, bumped ATOMICALLY inside the
 * create transaction (`upsert` + `increment`), so concurrent checkouts never
 * collide. `Order.orderNumber` still carries a UNIQUE constraint as a final
 * backstop.
 *
 * Unambiguous alphabet (no 0/O/1/I/L): 23456789ABCDEFGHJKLMNPQRSTUVWXYZ
 * 32 chars → 32^4 = 1,048,576 combinations per day — more than enough.
 */

/** 32-char unambiguous alphanumeric alphabet (no 0, 1, I, L, O). */
const UNAMBIGUOUS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Encode a sequence number into a 4-char unambiguous alphanumeric string. */
export function encodeSequence(seq: number): string {
  let s = seq;
  let result = '';
  for (let i = 0; i < 4; i++) {
    result = UNAMBIGUOUS[s % 32] + result;
    s = Math.floor(s / 32);
  }
  return result;
}

export function formatOrderNumber(date: Date, sequence: number): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `SQ-${yy}${mm}${dd}-${encodeSequence(sequence)}`;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
