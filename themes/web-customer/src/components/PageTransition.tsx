/**
 * Page transition — wraps each route in a slide/fade so navigation feels
 * native instead of a browser jump-cut. Rendered inside `AnimatePresence`,
 * keyed by the current location in App.tsx.
 */
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { pageVariants } from '@/lib/motion';

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen"
    >
      {children}
    </motion.div>
  );
}
