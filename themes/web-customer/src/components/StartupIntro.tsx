import { useEffect, useRef, useState } from 'react';
import { BrandLogo } from '@samou-go/ui';

/** Mounted only during cold startup, never for route loading or app resume. */
export function StartupIntro({ onComplete, waitingForSession }: { onComplete: () => void; waitingForSession: boolean }) {
  const completed = useRef(false);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      if (completed.current) return;
      completed.current = true;
      setFinished(true);
      onComplete();
    }, reduced ? 900 : 3000);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return <main className="fixed inset-0 z-50 flex items-center justify-center bg-white" aria-label="Samou Quick" aria-busy={waitingForSession}>
    <div className="official-brand-intro"><BrandLogo size={240} /></div>
    {finished && waitingForSession && <p role="status" dir="rtl" className="absolute inset-x-5 bottom-10 text-center text-sm text-slate-600">جارٍ استعادة جلستك…</p>}
  </main>;
}
