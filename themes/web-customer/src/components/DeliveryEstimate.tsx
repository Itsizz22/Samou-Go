import type { Store } from '@samou-go/shared-types';
import { useLanguage } from '@samou-go/ui';
import { useStore } from '@/hooks/useApi';
import { storeIsOpen } from './StoreHours';
export function DeliveryEstimate({ store, compact = false }: { store: Store; compact?: boolean }) {
  const { t } = useLanguage();
  if (!storeIsOpen(store)) return null;
  const estimate = store.deliveryEstimate;
  if (compact && !estimate) return null;
  return <p className="mt-2 text-xs leading-5 text-ink-muted">
    {estimate ? <>{t('وصول تقديري', 'Estimated arrival')}: <span dir="ltr">{estimate.minMinutes}–{estimate.maxMinutes}</span> {t('دقيقة', 'min')}{!compact && <span className="block text-micro">{t('بحسب الطلبات السابقة؛ يختلف حسب العنوان والازدحام', 'Based on past orders; varies with address and demand')}</span>}</> : t('وقت الوصول يتضح بعد تأكيد المتجر', 'Arrival estimate available after store confirmation')}
  </p>;
}
export function CheckoutDeliveryEstimate({ storeId, pickup }: { storeId: string; pickup: boolean }) {
  const { data } = useStore(storeId);
  const { t } = useLanguage();
  if (!data) return null;
  return <div className="mb-3 rounded-xl bg-canvas p-3"><strong className="text-sm">{data.nameAr}</strong>{pickup ? <p className="text-xs text-ink-muted">{t('يؤكد المتجر موعد جاهزية الاستلام بعد قبول الطلب', 'The store confirms pickup readiness after accepting')}</p> : <DeliveryEstimate store={data} />}</div>;
}
