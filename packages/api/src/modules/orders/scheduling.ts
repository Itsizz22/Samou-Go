import { unprocessable } from '../../lib/http-error';

export const SCHEDULE_TIME_ZONE = 'Asia/Hebron';

/** A scheduled time is the requested kitchen start, never a guaranteed arrival ETA. */
export function validateScheduledStart(
  value: string | undefined,
  store: { acceptsScheduledOrders: boolean; openingTime: string | null; closingTime: string | null },
  now = new Date(),
): Date | null {
  if (!value) return null;
  const date = new Date(value);
  const lead = date.getTime() - now.getTime();
  if (!store.acceptsScheduledOrders) throw unprocessable('SCHEDULING_DISABLED', 'هذا المتجر لا يستقبل طلبات مجدولة');
  if (!Number.isFinite(lead) || lead < 60 * 60_000 || lead > 7 * 24 * 60 * 60_000) {
    throw unprocessable('INVALID_SCHEDULE', 'اختر موعداً بعد ساعة على الأقل وخلال أسبوع');
  }
  if (!store.openingTime || !store.closingTime) throw unprocessable('STORE_HOURS_REQUIRED', 'يجب تحديد ساعات عمل المتجر قبل الجدولة');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: SCHEDULE_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  const { openingTime: open, closingTime: close } = store;
  const inside = open === close || (open < close ? parts >= open && parts < close : parts >= open || parts < close);
  if (!inside) throw unprocessable('OUTSIDE_STORE_HOURS', 'الموعد خارج ساعات عمل المتجر بتوقيت السموع');
  return date;
}
