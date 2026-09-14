const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Hebron', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function storeLocalDateTime(date: Date): string { return formatter.format(date).replace(' ', 'T'); }
export function endOfStoreDay(): string {
  const day = storeLocalDateTime(new Date()).slice(0, 10);
  const tomorrow = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return storeTimeToIso(`${tomorrow}T00:00`) ?? new Date(Date.now() + 24 * 60 * 60_000).toISOString();
}
/** Resolve the store's wall clock independently of the customer's device timezone. */
export function storeTimeToIso(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const target = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(target)) return undefined;
  let instant = target;
  for (let i = 0; i < 3; i++) instant += target - Date.parse(`${storeLocalDateTime(new Date(instant))}:00Z`);
  return storeLocalDateTime(new Date(instant)) === value ? new Date(instant).toISOString() : undefined;
}
