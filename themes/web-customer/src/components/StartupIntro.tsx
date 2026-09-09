import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandLogo } from '@samou-go/ui';
import introUrl from '@/assets/startup-intro.mp4';
import firstFrameUrl from '@/assets/startup-first-frame.png';

/** Play the supplied film on cold launch; navigation waits for its actual end. */
export function StartupIntro({ onComplete, waitingForSession }: { onComplete: () => void; waitingForSession: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const completed = useRef(false);
  const [finished, setFinished] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const revealVideo = () => {
    const element = video.current;
    if (!element) return;
    const reveal = () => { if (video.current === element) setFrameReady(true); };
    if (typeof element.requestVideoFrameCallback === "function") element.requestVideoFrameCallback(reveal);
    else requestAnimationFrame(() => requestAnimationFrame(reveal));
  };
  const [fallback, setFallback] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    setFinished(true);
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (fallback) {
      const timer = window.setTimeout(finish, 1200);
      return () => window.clearTimeout(timer);
    }
    let watchdog: number | undefined;
    let active = true;
    const resume = () => {
      window.clearTimeout(watchdog);
      if (document.hidden) { video.current?.pause(); return; }
      if (completed.current) return;
      // A failed decoder or stalled file must not block entry to the app.
      watchdog = window.setTimeout(() => setFallback(true), 12000);
      const element = video.current;
      if (element) {
        element.muted = true;
        void element.play().catch(() => { if (active) setFallback(true); });
      }
    };
    resume();
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      window.clearTimeout(watchdog);
      document.removeEventListener('visibilitychange', resume);
      video.current?.pause();
    };
  }, [fallback, finish]);

  return <main className="fixed inset-0 z-50 flex items-center justify-center bg-white" aria-label="Samou Quick" aria-busy={waitingForSession}>
    {fallback ? <BrandLogo size={240} /> : <>
      <img src={firstFrameUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-contain" />
      <video ref={video} autoPlay muted playsInline preload="auto" controls={false}
        disablePictureInPicture disableRemotePlayback poster={firstFrameUrl}
        aria-label="فيديو بداية سموع كويك" tabIndex={-1}
        className="startup-film pointer-events-none relative h-full w-full object-contain"
        style={{ opacity: frameReady ? 1 : 0 }} src={introUrl}
        onPlaying={revealVideo} onEnded={finish} onError={() => setFallback(true)} />
    </>}
    {finished && waitingForSession && <p role="status" dir="rtl" className="absolute inset-x-5 bottom-10 text-center text-sm text-slate-600">جارٍ استعادة جلستك…</p>}
  </main>;
}
