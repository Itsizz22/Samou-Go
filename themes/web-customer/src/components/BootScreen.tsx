/**
 * Boot sequence — animated logo entrance that hands off to the primary view.
 *
 * Shows while the stored session is being restored (token hydration + `/me`),
 * then cross-fades away. On cold start the customer sees a brand moment rather
 * than a flash of empty shells; on warm restarts the boot is near-instant.
 */
import { motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';
import { bootVariants } from '@/lib/motion';

export function BootScreen() {
  return (
    <main
      dir="rtl"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas"
      aria-label="جاري التحميل / Loading"
      aria-busy="true"
    >
      <motion.div
        variants={bootVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="flex flex-col items-center gap-4"
      >
        <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand text-white shadow-brand">
          <ShoppingCart size={38} strokeWidth={2.5} />
        </span>
        <p className="text-xl font-extrabold tracking-tight text-ink" dir="ltr">
          Samou' Go
        </p>
        <p className="text-[11px] text-ink-muted" dir="ltr">
          Samou' · Hebron · Palestine
        </p>
      </motion.div>
    </main>
  );
}
