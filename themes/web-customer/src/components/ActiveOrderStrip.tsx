import { Link } from 'react-router-dom';
import { Package, ArrowLeft } from 'lucide-react';
import { ORDER_STATUS_LABELS, type OrderSummary } from '@samou-go/shared-types';
import { useLanguage } from '@samou-go/ui';
export function ActiveOrderStrip({ orders }: { orders: OrderSummary[] }) {
  const { t } = useLanguage();
  const active = orders.filter(order => order.status !== 'DELIVERED' && order.status !== 'CANCELLED');
  if (!active.length) return null;
  return <section aria-label={t('طلباتك الجارية', 'Your active orders')} className="mx-auto mb-4 max-w-md space-y-2 px-5">
    {active.map(order => <Link key={order.id} to={`/orders/${encodeURIComponent(order.id)}`} className="flex min-h-20 items-center gap-3 rounded-2xl border border-brand bg-brand-tint p-3 text-brand-dark focus-visible:outline-2 focus-visible:outline-brand">
      <Package size={24} className="shrink-0" />
      <span className="min-w-0 flex-1"><strong className="block text-sm">{order.storeNameAr} · <bdi>{order.orderNumber}</bdi></strong><span className="text-xs">{t(ORDER_STATUS_LABELS[order.status].ar, ORDER_STATUS_LABELS[order.status].en)}</span></span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-bold">{t('تتبّع طلبي', 'Track order')}<ArrowLeft size={16} className="ltr:rotate-180" /></span>
    </Link>)}
  </section>;
}
