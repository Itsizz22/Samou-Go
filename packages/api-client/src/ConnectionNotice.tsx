import { useSyncExternalStore } from 'react';
import { connectionSnapshot, subscribeConnection } from './connection';
export function ConnectionNotice() {
  const failed = useSyncExternalStore(subscribeConnection, connectionSnapshot, () => false);
  if (!failed) return null;
  return <aside dir="rtl" role="status" className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-100 px-4 py-3 text-sm text-amber-950">
    <span>الاتصال بالخادم متعذر. قد لا تكون حالات الطلبات محدثة.</span>
    <button className="shrink-0 rounded-lg border px-3 py-2 font-bold" onClick={() => window.dispatchEvent(new Event('samou:retry-connection'))}>إعادة المحاولة</button>
  </aside>;
}
