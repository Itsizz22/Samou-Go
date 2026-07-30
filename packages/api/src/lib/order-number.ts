/**
 * Human-facing order references: `SG-260728-0042`
 * — `SG` Samou' Go, `YYMMDD`, then a zero-padded per-day sequence.
 *
 * The sequence is derived from a same-day count inside the create transaction.
 * Two simultaneous checkouts can land on the same number, so `Order.orderNumber`
 * carries a UNIQUE constraint and the service retries on collision.
 */
export function formatOrderNumber(date: Date, sequence: number): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `SG-${yy}${mm}${dd}-${String(sequence).padStart(4, '0')}`;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function startOfNextDay(date: Date): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + 1);
  return copy;
}
