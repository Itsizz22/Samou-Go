/** Store hours are always interpreted in Palestine, including DST. */
export function isWithinStoreHours(store: { openingTime?: string | null; closingTime?: string | null }, now = new Date()): boolean {
  const { openingTime: open, closingTime: close } = store;
  const valid = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!open || !close || !valid.test(open) || !valid.test(close)) return true;
  if (open === close) return true;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hebron', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return open < close ? time >= open && time < close : time >= open || time < close;
}
