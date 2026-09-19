import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlatformSettings } from '@samou-go/api-client';
import { useLanguage } from '@samou-go/ui';
import type { HomeVideoAd } from '@samou-go/shared-types';
import { useVideoFirstFrame } from '@/lib/useVideoFirstFrame';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function AdPlayer({ ad, active, visible, next }: { ad: HomeVideoAd; active: boolean; visible: boolean; next: () => void }) {
  const { t } = useLanguage();
  const { video, frameReady, revealVideo } = useVideoFirstFrame();
  const [aspectRatio, setAspectRatio] = useState(9 / 16);
  const [paused, setPaused] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reduce, setReduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduce(media.matches);
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!active || !visible || paused || (reduce && !manual)) { element.pause(); return; }
    let cancelled = false;
    element.muted = true;
    void element.play().then(() => { if (!cancelled) setBlocked(false); }).catch(() => { if (!cancelled) setBlocked(true); });
    return () => { cancelled = true; element.pause(); };
  }, [active, visible, paused, reduce, manual]);
  const toggle = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) {
      setManual(true); setPaused(false);
      void element.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    } else { setPaused(true); element.pause(); }
  };
  return <div className="relative w-full overflow-hidden rounded-2xl bg-ink" style={{ aspectRatio }}>
    {active && ad.posterUrl && <img src={ad.posterUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />}
    {active ? <video ref={video} src={ad.videoUrl} poster={ad.posterUrl} muted playsInline autoPlay={visible && !paused && (!reduce || manual)} preload="auto" controls={false} disablePictureInPicture disableRemotePlayback
      onPlaying={revealVideo} style={{ opacity: frameReady ? 1 : 0 }}
      role="button" tabIndex={0}
      aria-label={`${ad.title} — ${paused || blocked || (reduce && !manual) ? t('تشغيل الإعلان', 'Play ad') : t('إيقاف الإعلان', 'Pause ad')}`}
      onClick={toggle} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } }}
      className="inline-autoplay-video relative h-full w-full cursor-pointer object-cover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand"
      onLoadedMetadata={event => { const element = event.currentTarget; if (element.videoWidth && element.videoHeight) setAspectRatio(element.videoWidth / element.videoHeight); }}
      onError={() => setFailed(true)}
      onTimeUpdate={event => { const element = event.currentTarget; setProgress(element.duration ? element.currentTime / element.duration : 0); }}
      onEnded={() => { if (!reduce) next(); else setPaused(true); }} />
      : ad.posterUrl ? <img src={ad.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
    {active && <>
      <span className="absolute start-3 top-3 rounded-md bg-ink/70 px-2 py-1 text-xs font-bold text-white">{t('إعلان', 'Advertisement')}</span>
      {failed ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/90 p-5 text-center text-white">
        <p>{t('تعذر تشغيل الإعلان', 'Unable to play this ad')}</p>
        <button type="button" className="min-h-11 rounded-lg border border-white/50 px-4" onClick={() => { setFailed(false); video.current?.load(); void video.current?.play().catch(() => setBlocked(true)); }}>{t('إعادة المحاولة', 'Retry')}</button>
      </div> : null}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-hidden="true"><div className="h-full origin-left bg-brand" style={{ transform: `scaleX(${progress})` }} /></div>
    </>}
  </div>;
}

export function VideoAdCarousel() {
  const { t, dir } = useLanguage();
  const settings = usePlatformSettings({ pollMs: 60000 });
  const ads = (settings.data?.homeVideos ?? []).filter(ad => ad.enabled && ad.videoUrl);
  const signature = ads.map(ad => ad.id + ad.videoUrl).join('|');
  const rail = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const [railHeight, setRailHeight] = useState<number>();
  useEffect(() => {
    const slide = rail.current?.children[active];
    if (!(slide instanceof HTMLElement)) return;
    const updateHeight = () => setRailHeight(slide.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(slide);
    return () => observer.disconnect();
  }, [active, signature]);
  useEffect(() => {
    const root = section.current;
    if (!root) return;
    let onScreen = false;
    const update = () => setVisible(onScreen && document.visibilityState === 'visible');
    const observer = new IntersectionObserver(entries => { onScreen = (entries[0]?.intersectionRatio ?? 0) >= 0.5; update(); }, { threshold: [0, 0.5] });
    observer.observe(root); document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, [signature]);
  useEffect(() => {
    setActive(0); rail.current?.scrollTo({ left: 0, behavior: 'instant' });
  }, [signature]);
  const go = (index: number) => {
    const target = rail.current?.children[index];
    if (target instanceof HTMLElement) rail.current?.scrollTo({ left: target.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  if (!ads.length) return null;
  return <section ref={section} className="video-ad-section mx-auto max-w-md px-5 pt-5" aria-label={t('إعلانات الفيديو', 'Video advertisements')}>
    <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold">{t('شاهد الجديد', 'See what’s new')}</h2><span className="text-xs text-ink-muted">{t('إعلانات', 'Advertisements')}</span></div>
    <div ref={rail} dir="ltr" data-swipe-back="off" style={{ height: railHeight }} className="relative flex items-start snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-none" onScroll={() => {
      const element = rail.current; if (!element) return;
      const index = Math.round(element.scrollLeft / (element.clientWidth + 12));
      setActive(Math.max(0, Math.min(ads.length - 1, index)));
    }}>
      {ads.map((ad, index) => <article key={ad.id + ad.videoUrl} dir={dir} className="w-full min-w-0 shrink-0 snap-start">
        <AdPlayer key={`${ad.id}-${index === active}`} ad={ad} active={index === active} visible={visible} next={() => {
          if (ads.length === 1) { const element = rail.current?.querySelector('video'); if (element) { element.currentTime = 0; void element.play().catch(() => undefined); } }
          else go((index + 1) % ads.length);
        }} />
        <div className="flex min-h-12 items-center justify-between gap-3 py-2"><h3 className="text-sm font-bold">{ad.title}</h3>{ad.storeId && <Link to={`/stores/${encodeURIComponent(ad.storeId)}`} className="min-h-11 content-center text-sm font-bold text-brand">{t('زيارة المتجر', 'Visit store')}</Link>}</div>
      </article>)}
    </div>
    {ads.length > 1 && <div className="flex items-center justify-between gap-2">
      <button type="button" aria-label={t('الإعلان السابق', 'Previous ad')} onClick={() => go((active - 1 + ads.length) % ads.length)} className="grid size-11 place-items-center rounded-full bg-surface text-brand"><ChevronRight className="rtl:rotate-180" size={20} /></button>
      <p className="text-xs text-ink-muted">{t('اسحب لتغيير الفيديو', 'Swipe to change video')} · <bdi>{active + 1}/{ads.length}</bdi></p>
      <button type="button" aria-label={t('الإعلان التالي', 'Next ad')} onClick={() => go((active + 1) % ads.length)} className="grid size-11 place-items-center rounded-full bg-surface text-brand"><ChevronLeft className="rtl:rotate-180" size={20} /></button>
    </div>}
  </section>;
}
