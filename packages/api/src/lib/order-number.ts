/** New orders use YYMMDD plus an atomic decimal daily sequence. Existing stored references are unchanged. */

/** 32-char unambiguous alphanumeric alphabet (no 0, 1, I, L, O). */
const UNAMBIGUOUS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Legacy formatter retained for older tooling; new orders use formatOrderNumber. */
export function encodeSequence(seq: number): string {
  let s = seq;
  let result = '';
  for (let i = 0; i < 4; i++) {
    result = UNAMBIGUOUS[s % 32] + result;
    s = Math.floor(s / 32);
  }
  return result;
}

export { generateOrderNumber as formatOrderNumber } from '@samou-go/shared-types';

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
