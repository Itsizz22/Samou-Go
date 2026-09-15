import { Check, X, Clock3, ChefHat, ShoppingBag, Bike, CircleCheck } from 'lucide-react';
import { ORDER_STATUS_LABELS, ORDER_STATUS_SEQUENCE, OrderStatus } from '@samou-go/shared-types';
import { cn, useLanguage } from '@samou-go/ui';

interface OrderStatusTimelineProps {
  status: OrderStatus;
  className?: string;
  compact?: boolean;
  pickup?: boolean;
}

export function OrderStatusTimeline({ status, className, compact = false, pickup = false }: OrderStatusTimelineProps) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  if (status === OrderStatus.CANCELLED) return <div role="status" className={cn('flex items-center gap-3 rounded-xl bg-danger-tint p-4 text-danger-ink', className)}><X size={22} /><p className="text-sm font-bold">{ar ? 'تم إلغاء الطلب' : 'Order cancelled'}</p></div>;

  const sequence = pickup ? ORDER_STATUS_SEQUENCE.filter(step => step !== OrderStatus.ON_THE_WAY) : ORDER_STATUS_SEQUENCE;
  // Legacy pickup orders may still have a delivery status; display ready to collect.
  const currentIndex = sequence.indexOf(pickup && status === OrderStatus.ON_THE_WAY ? OrderStatus.READY_FOR_PICKUP : status);
  const hints: Partial<Record<OrderStatus, [string, string]>> = {
    [OrderStatus.PENDING]: ['بانتظار تأكيد المتجر لطلبك.', 'Waiting for the store to confirm your order.'],
    [OrderStatus.ACCEPTED]: ['أكد المتجر طلبك وسيبدأ تجهيزه.', 'The store confirmed your order. Preparation is next.'],
    [OrderStatus.PREPARING]: ['المتجر يجهّز طلبك الآن.', 'The store is preparing your order.'],
    [OrderStatus.READY_FOR_PICKUP]: pickup ? ['طلبك جاهز. توجّه إلى المتجر للاستلام.', 'Your order is ready. Head to the store to collect it.'] : ['طلبك جاهز وبانتظار استلام الكابتن.', 'Your order is ready for the courier to collect.'],
    [OrderStatus.ON_THE_WAY]: ['الكابتن في طريقه إليك.', 'Your courier is on the way to you.'],
    [OrderStatus.DELIVERED]: pickup ? ['تم استلام طلبك. بالعافية!', 'Order collected. Enjoy!'] : ['وصل طلبك. بالعافية!', 'Order delivered. Enjoy!'],
  };
  const icons = { [OrderStatus.PENDING]: Clock3, [OrderStatus.ACCEPTED]: CircleCheck, [OrderStatus.PREPARING]: ChefHat, [OrderStatus.READY_FOR_PICKUP]: ShoppingBag, [OrderStatus.ON_THE_WAY]: Bike, [OrderStatus.DELIVERED]: CircleCheck };
  return <div dir={ar ? 'rtl' : 'ltr'} className={className}>
    {!compact && <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-extrabold text-ink">{ar ? 'مراحل طلبك' : 'Order progress'}</h2><span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-bold text-brand-dark">{pickup ? (ar ? 'استلام من المتجر' : 'Store pickup') : (ar ? 'توصيل' : 'Delivery')}</span></div>}
    <ol aria-label={ar ? 'حالة الطلب' : 'Order progress'} className={compact ? 'flex items-center' : 'space-y-0'}>
      {sequence.map((step, index) => {
        const current = index === currentIndex;
        const complete = index < currentIndex || (current && status === OrderStatus.DELIVERED);
        const label = pickup && step === OrderStatus.DELIVERED ? { ar: 'تم الاستلام', en: 'Collected' } : ORDER_STATUS_LABELS[step];
        const Icon = icons[step as keyof typeof icons] ?? Clock3;
        const hint = hints[step];
        return <li key={step} aria-current={current ? 'step' : undefined} className={cn('relative', compact ? 'flex flex-1 items-center' : 'flex gap-3')}>
          <div className={cn('flex shrink-0 flex-col items-center', compact ? '' : 'w-10')}>
            <span aria-hidden="true" className={cn('relative z-10 flex shrink-0 items-center justify-center rounded-full', compact ? 'h-6 w-6' : 'h-10 w-10', current ? 'bg-brand text-white ring-4 ring-brand-tint' : complete ? 'bg-brand-tint text-brand-dark' : 'border border-line bg-canvas text-ink-muted')}>
              {complete ? <Check size={compact ? 13 : 18} strokeWidth={3} /> : <Icon size={compact ? 13 : 19} />}
            </span>
            {!compact && index < sequence.length - 1 && <span aria-hidden="true" className={cn('my-1 w-0.5 min-h-3 flex-1', complete ? 'bg-brand-tint' : 'bg-line')} />}
          </div>
          {compact ? <><span className="sr-only">{ar ? label.ar : label.en}</span>{index < sequence.length - 1 && <span aria-hidden="true" className={cn('h-0.5 flex-1', complete ? 'bg-brand' : 'bg-line')} />}</> : <div className={cn('min-w-0 flex-1 pt-2', index < sequence.length - 1 ? 'pb-5' : '', current ? 'text-brand-dark' : complete ? 'text-ink' : 'text-ink-muted')}>
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold leading-6">{ar ? label.ar : label.en}</span>{current && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-bold">{status === OrderStatus.DELIVERED ? (ar ? 'مكتمل' : 'Complete') : (ar ? 'الآن' : 'Now')}</span>}</div>
            {current && hint && <p role="status" className="mt-1 text-xs leading-6 text-ink-muted">{hint[ar ? 0 : 1]}</p>}
          </div>}
        </li>;
      })}
    </ol>
  </div>;
}
