/**
 * Human-facing order references: `SG-260728-0042`
 * — `SG` Samou' Go, `YYMMDD`, then a zero-padded per-day sequence.
 *
 * The sequence comes from `DailyOrderSequence`, bumped ATOMICALLY inside the
 * create transaction (`upsert` + `increment`), so concurrent checkouts never
 * collide. `Order.orderNumber` still carries a UNIQUE constraint as a final
 * backstop.
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
