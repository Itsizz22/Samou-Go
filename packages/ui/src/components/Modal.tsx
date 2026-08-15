/**
 * Samou' Go — Modal / bottom sheet.
 *
 * `variant="sheet"` (the default on phones) slides up from the bottom edge;
 * `variant="dialog"` scales in centred. Both trap Escape, lock body scroll and
 * restore focus on close — behaviour the apps were each re-implementing.
 *
 * Framer Motion is a peer dependency: every app already ships it, and
 * `AnimatePresence` is what lets the exit animation finish before unmount.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export type ModalVariant = 'sheet' | 'dialog';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Rendered as the panel heading unless `hideTitle`. */
  title?: ReactNode;
  hideTitle?: boolean;
  children: ReactNode;
  /** Pinned action row at the bottom of the panel. */
  footer?: ReactNode;
  variant?: ModalVariant;
  className?: string;
  /** Set false for a blocking confirmation. */
  dismissible?: boolean;
}

const PANEL_MOTION = {
  sheet: {
    initial: { y: '100%', opacity: 0.6 },
    animate: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0.4 },
  },
  dialog: {
    initial: { scale: 0.94, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.96, opacity: 0 },
  },
} as const;

export function Modal({
  open,
  onClose,
  title,
  hideTitle,
  children,
  footer,
  variant = 'sheet',
  className,
  dismissible = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    // Body scroll lock — without it the sheet drags the page behind it on iOS.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the panel so the keyboard and screen reader follow.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className={cn(
            'fixed inset-0 z-40 flex',
            variant === 'sheet' ? 'items-end' : 'items-center justify-center p-gutter'
          )}
        >
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismissible ? onClose : undefined}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            tabIndex={-1}
            className={cn(variant === 'sheet' ? 'modal-sheet' : 'modal-panel', className)}
            initial={PANEL_MOTION[variant].initial}
            animate={PANEL_MOTION[variant].animate}
            exit={PANEL_MOTION[variant].exit}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            {variant === 'sheet' ? (
              <div className="mx-auto mb-3 h-1 w-10 rounded-pill bg-line" aria-hidden="true" />
            ) : null}
            {title && !hideTitle ? (
              <h2 className="mb-3 text-subheading font-bold text-ink">{title}</h2>
            ) : null}
            <div className="text-body text-ink-soft">{children}</div>
            {footer ? <div className="mt-5 flex gap-2">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
