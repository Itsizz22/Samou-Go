/**
 * Samou' Go — OrderSuccess.
 *
 * The moment after checkout: a captain rides off with the order while a check
 * mark draws itself. Framer Motion + inline SVG, deliberately no Lottie — a
 * JSON animation would add a dependency and a network asset for one screen.
 *
 * Direction-aware: in RTL (the default) the bike travels right→left, matching
 * the reading direction; in LTR it is mirrored. Honours `prefers-reduced-motion`
 * by rendering the final frame with no movement.
 *
 * Used by web-customer (order placed) and web-checkout (basket submitted).
 */
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

/** Reads the document direction once per render; no listener needed. */
function useIsRtl(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.dir !== 'ltr';
}

export function OrderSuccess({
  orderNumber,
  title = 'تم استلام طلبك',
  subtitle = 'الكابتن في الطريق إليك',
  eta,
  actions,
  className,
}: OrderSuccessProps) {
  const reduceMotion = useReducedMotion();
  const rtl = useIsRtl();

  return (
    <div
      className={cn('flex flex-col items-center gap-5 px-gutter py-8 text-center', className)}
      role="status"
      aria-live="polite"
    >
      <DeliveryScene rtl={rtl} still={Boolean(reduceMotion)} />

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
        <div className="surface-sunken flex items-center gap-2 px-4 py-2.5">
          <span className="text-caption text-ink-muted">رقم الطلب</span>
          <span className="numeral text-caption font-bold text-ink">{orderNumber}</span>
        </div>
      ) : null}

      {eta ? <p className="text-caption font-semibold text-brand-deep">{eta}</p> : null}

      {actions ? <div className="mt-1 flex w-full flex-col gap-2">{actions}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The scene: check-mark ring, road, bike, exhaust puffs
 * ------------------------------------------------------------------------- */

interface SceneProps {
  rtl: boolean;
  still: boolean;
}

function DeliveryScene({ rtl, still }: SceneProps) {
  /* Travel direction: RTL rides right→left. The bike art faces left, so it is
     mirrored in LTR. */
  const from = rtl ? 46 : -46;
  const to = rtl ? -8 : 8;

  return (
    <div className="relative flex h-40 w-full max-w-xs items-center justify-center">
      {/* Soft brand halo behind the whole scene. */}
      <motion.div
        className="absolute size-28 rounded-pill bg-brand-tint"
        initial={still ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE_OUT_SOFT }}
        aria-hidden="true"
      />

      <SuccessRing still={still} />

      {/* Road + rider sit below the ring. */}
      <div className="absolute bottom-0 w-full">
        <Road still={still} rtl={rtl} />
        <motion.div
          className="absolute bottom-2.5 start-1/2 text-brand-deep"
          initial={still ? false : { x: `${from}%`, opacity: 0 }}
          animate={still ? { x: `${to}%`, opacity: 1 } : { x: `${to}%`, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.9, ease: EASE_OUT_SOFT }}
          aria-hidden="true"
        >
          <motion.div
            animate={still ? undefined : { y: [0, -3, 0], rotate: [-1, 1, -1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transform: rtl ? undefined : 'scaleX(-1)' }}
          >
            <ScooterIcon />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/** The emerald disc with a check mark that draws itself. */
function SuccessRing({ still }: { still: boolean }) {
  return (
    <motion.div
      className="relative flex size-20 items-center justify-center rounded-pill bg-brand shadow-brand"
      initial={still ? false : { scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
    >
      <svg viewBox="0 0 48 48" className="size-10" fill="none" aria-hidden="true">
        <motion.path
          d="M13 25.5 L20.5 33 L35 17"
          stroke="white"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={still ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.35, duration: 0.45, ease: 'easeOut' }}
        />
      </svg>
    </motion.div>
  );
}

/** Dashed road that slides under the bike, plus a horizon line. */
function Road({ still, rtl }: SceneProps) {
  return (
    <svg viewBox="0 0 320 24" className="h-6 w-full" fill="none" aria-hidden="true">
      <line x1="0" y1="18" x2="320" y2="18" stroke="var(--color-line)" strokeWidth="2" />
      <motion.line
        x1="0"
        y1="18"
        x2="320"
        y2="18"
        stroke="var(--color-brand-soft)"
        strokeWidth="2"
        strokeDasharray="14 18"
        initial={{ strokeDashoffset: 0 }}
        animate={still ? undefined : { strokeDashoffset: rtl ? 64 : -64 }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
      />
    </svg>
  );
}

/**
 * Delivery scooter with a insulated box on the back — drawn facing left, which
 * is the direction of travel in RTL. `currentColor` picks up the brand ink.
 */
function ScooterIcon() {
  return (
    <svg viewBox="0 0 64 40" className="h-10 w-16" fill="none" aria-hidden="true">
      {/* delivery box */}
      <rect x="38" y="8" width="16" height="13" rx="2.5" fill="currentColor" />
      <path d="M38 14h16" stroke="var(--color-brand-tint)" strokeWidth="1.5" />
      {/* body + seat */}
      <path
        d="M20 22h14l4-6h6l3 6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* handlebar + front fairing */}
      <path
        d="M20 22 14 14h-5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* wheels */}
      <circle cx="15" cy="30" r="6.5" stroke="currentColor" strokeWidth="3" />
      <circle cx="47" cy="30" r="6.5" stroke="currentColor" strokeWidth="3" />
      <circle cx="15" cy="30" r="1.5" fill="currentColor" />
      <circle cx="47" cy="30" r="1.5" fill="currentColor" />
    </svg>
  );
}
