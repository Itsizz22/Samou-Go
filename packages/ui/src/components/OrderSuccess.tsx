/** Checkout confirmation shared by the customer and checkout apps. */
import { Bike, Check } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface OrderSuccessProps {
  /** Shown in an LTR island with tabular figures, e.g. `SG-20260815-0007`. */
  orderNumber?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Optional "arrives in ~N minutes" line; the caller formats the number. */
  eta?: ReactNode;
  /** Action buttons — typically "track order" and "back to shop". */
  actions?: ReactNode;
  className?: string;
}

const EASE_OUT_SOFT = [0.22, 1, 0.36, 1] as const;


export function OrderSuccess({
  orderNumber,
  title = 'تم استلام طلبك بنجاح!',
  subtitle = 'سنبلغك بكل جديد عن حالة طلبك',
  eta,
  actions,
  className,
}: OrderSuccessProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn('mx-auto flex w-full max-w-md flex-col items-center gap-6 px-5 py-16 text-center font-sans', className)}
      role="status"
      aria-live="polite"
    >
      <motion.div className="relative flex size-40 items-center justify-center rounded-full bg-brand-tint" initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} aria-hidden="true">
        <span className="flex size-30 items-center justify-center rounded-full bg-brand text-white"><Check size={64} strokeWidth={3} /></span>
        <span className="absolute bottom-0 end-0 flex size-12 items-center justify-center rounded-full border-4 border-canvas bg-brand text-white"><Bike size={24} /></span>
      </motion.div>

      <div className="space-y-1.5">
        <motion.h2
          className="text-title font-bold text-ink"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.35, ease: EASE_OUT_SOFT }}
        >
          {title}
        </motion.h2>
        <motion.p
          className="text-body text-ink-muted"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65, duration: 0.35 }}
        >
          {subtitle}
        </motion.p>
      </div>

      {orderNumber ? (
        <div className="sq-panel flex w-full flex-col items-center gap-2 p-5">
          <span className="text-caption text-ink-muted">رقم الطلب</span>
          <span dir="ltr" className="numeral text-lg font-bold text-ink">{orderNumber}</span>
        </div>
      ) : null}

      {eta ? <p className="text-caption font-semibold text-brand-deep">{eta}</p> : null}

      {actions ? <div className="mt-1 flex w-full flex-col gap-3 [&_button]:min-h-13">{actions}</div> : null}
    </div>
  );
}
