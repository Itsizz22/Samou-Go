import { useCallback, useEffect, useRef, useState } from 'react';
import introUrl from '@/assets/startup-intro.mp4';
import posterUrl from '@/assets/startup-poster.png';

/** Mounted only during cold startup, never for route loading or app resume. */
export function StartupIntro({ onComplete, waitingForSession }: { onComplete: () => void; waitingForSession: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const completed = useRef(false);
  const [finished, setFinished] = useState(false);
  const [staticOnly, setStaticOnly] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    setFinished(true);
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    // A codec failure, autoplay rejection or stalled decode must never trap startup.
    const timer = window.setTimeout(finish, staticOnly ? 900 : 9000);
    if (!staticOnly) {
      video.current?.play().catch(() => setStaticOnly(true));
    }
    return () => window.clearTimeout(timer);
  }, [finish, staticOnly]);

  return <main className="fixed inset-0 z-50 bg-white" aria-label="Samou Quick" aria-busy={waitingForSession}>
    {staticOnly || finished ? <img src={posterUrl} alt="Samou Quick" className="h-full w-full object-contain" /> :
      <video ref={video} autoPlay muted playsInline preload="auto" disablePictureInPicture
        className="h-full w-full object-contain" aria-hidden="true"
        onEnded={finish} onError={() => setStaticOnly(true)}>
        <source src={introUrl} type="video/mp4" />
      </video>}
    {finished && waitingForSession && <p role="status" dir="rtl" className="absolute inset-x-5 bottom-10 text-center text-sm text-slate-600">جارٍ استعادة جلستك…</p>}
  </main>;
}