import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, Check } from 'lucide-react';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
interface AddedItem { name: string; imageUrl: string | null }
export function CartAddedNotice() {
  const [item, setItem] = useState<AddedItem | null>(null);
  const [paused, setPaused] = useState(false);
  const { pathname } = useLocation();
  const { t } = useLanguage();
  useEffect(() => {
    const added = (event: Event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail !== 'object' || !('name' in detail) || typeof detail.name !== 'string') return;
      setItem({ name: detail.name, imageUrl: 'imageUrl' in detail && typeof detail.imageUrl === 'string' ? detail.imageUrl : null });
      setPaused(false);
    };
    window.addEventListener('cart:item-added', added);
    return () => window.removeEventListener('cart:item-added', added);
  }, []);
  useEffect(() => { setItem(null); setPaused(false); }, [pathname]);
  useEffect(() => {
    if (!item || paused) return;
    const timer = window.setTimeout(() => setItem(null), 4500);
    return () => window.clearTimeout(timer);
  }, [item, paused]);
  if (!item || pathname === '/cart' || pathname === '/checkout') return null;
  return <aside className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-2xl border border-brand bg-surface p-3 text-ink shadow-raised" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <div className="flex items-center gap-3">
      <ImageWithFallback src={item.imageUrl ?? ''} alt="" fallback={<Check size={24} />} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
      <p role="status" className="min-w-0 flex-1 text-sm"><span className="block text-xs text-brand-dark">{t('أُضيف إلى السلة', 'Added to cart')}</span><strong className="block truncate">{item.name}</strong></p>
      <Link to="/cart" className="flex min-h-11 items-center rounded-xl bg-brand px-3 text-xs font-bold text-white">{t('عرض السلة', 'View cart')}</Link>
      <button type="button" aria-label={t('إغلاق', 'Dismiss')} onClick={() => setItem(null)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink-muted"><X size={18} /></button>
    </div>
  </aside>;
}
