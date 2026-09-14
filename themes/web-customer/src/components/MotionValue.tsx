import { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** Animate a changed value without counting through misleading intermediate prices. */
export function MotionValue({ value }: { value: string | number }) {
  const initialValue = useRef(value);
  const reduced = useReducedMotion();
  return <motion.span key={value} dir="ltr" className="inline-block tabular-nums"
    initial={reduced || value === initialValue.current ? false : { opacity: 0.5, y: 4 }}
    animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.18 }}
  >{value}</motion.span>;
}
