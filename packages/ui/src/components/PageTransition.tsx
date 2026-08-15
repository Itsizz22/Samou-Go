/**
 * Samou' Go — page/route transition.
 *
 * web-customer already had a local `PageTransition`; this is the shared version
 * so the other six apps get the same feel when they swap views. Motion is a
 * short rise + fade — long slides read as lag on a mid-range Android phone.
 *
 * RTL-safe: it animates on the Y axis only, so nothing has to be mirrored.
 */
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface PageTransitionProps {
  /** Changing this key replays the animation — pass the route or screen id. */
  transitionKey?: string;
  children: ReactNode;
  className?: string;
}

export function PageTransition({ transitionKey, children, className }: PageTransitionProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKey}
        className={cn('flex-1', className)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export interface StaggerListProps {
  children: ReactNode;
  className?: string;
  /** Seconds between children. Keep small — 0.04 reads as one motion. */
  stagger?: number;
}

/** Fades a list in from the top down; wrap each row in `StaggerItem`. */
export function StaggerList({ children, className, stagger = 0.04 }: StaggerListProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}
