/**
 * Order lifecycle timeline — Pending → … → Delivered, driven by
 * `ORDER_STATUS_SEQUENCE` from shared-types so the UI cannot drift from the
 * state machine. CANCELLED renders as a red aborted state.
 */
import { Check, X } from 'lucide-react';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_SEQUENCE,
  OrderStatus,
} from '@samou-go/shared-types';
import { motion } from 'framer-motion';
import { cn } from '@samou-go/ui';

interface OrderStatusTimelineProps {
  status: OrderStatus;
  className?: string;
  compact?: boolean;
}

export function OrderStatusTimeline({ status, className, compact = false }: OrderStatusTimelineProps) {
  if (status === OrderStatus.CANCELLED) {
    return (
      <div className={cn('flex items-center gap-2 rounded-xl bg-danger-tint p-3 text-danger-ink', className)}>
        <X size={16} className="shrink-0" />
        <p className="text-xs font-bold">
          تم إلغاء الطلب <span dir="ltr" className="font-semibold">Order cancelled</span>
        </p>
      </div>
    );
  }

  const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(status);
  const reached = (index: number) => index <= currentIndex;

  return (
    <ol className={cn('flex items-start', className)} aria-label="حالة الطلب / Order progress">
      {ORDER_STATUS_SEQUENCE.map((step, index) => {
        const done = reached(index);
        const isCurrent = index === currentIndex;
        const isLast = index === ORDER_STATUS_SEQUENCE.length - 1;
        const label = ORDER_STATUS_LABELS[step];
        return (
          <li key={step} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              {index > 0 && (
                <span className={cn('h-0.5 flex-1', reached(index) ? 'bg-brand' : 'bg-line-soft')} />
              )}
              <motion.span
                key={`${step}:${done}`}
                initial={isCurrent ? { scale: 0.6 } : false}
                animate={isCurrent ? { scale: 1 } : undefined}
                transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                className={cn(
                  'flex items-center justify-center rounded-full border-2 transition-colors',
                  compact ? 'h-6 w-6' : 'h-8 w-8',
                  done
                    ? 'border-brand bg-brand text-white'
                    : 'border-line-soft bg-surface text-ink-muted'
                )}
              >
                {done ? (
                  <Check size={compact ? 12 : 15} strokeWidth={3} />
                ) : (
                  <span className="text-micro font-bold">{index + 1}</span>
                )}
              </motion.span>
              {!isLast && (
                <span className={cn('h-0.5 flex-1', reached(index + 1) ? 'bg-brand' : 'bg-line-soft')} />
              )}
            </div>
            {!compact && (
              <div className="mt-1.5">
                <span className={cn('block text-micro font-bold', done ? 'text-brand-dark' : 'text-ink-muted')}>
                  {label.ar}
                </span>
                <span
                  className={cn('block text-micro', done ? 'text-ink-muted' : 'text-ink-muted')}
                  dir="ltr"
                >
                  {label.en}
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
