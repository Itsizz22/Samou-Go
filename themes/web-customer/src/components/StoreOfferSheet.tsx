import { useEffect, useRef } from 'react';
import { X, BadgePercent } from 'lucide-react';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
import type { Offer } from '@samou-go/shared-types';
import { formatCurrency } from '@/lib/delivery';

export function StoreOfferSheet({ offer, storeName, canOrder, onClose, onAdd, onBrowse }: {
  offer: Offer; storeName: string; canOrder: boolean; onClose: () => void; onAdd: () => void; onBrowse: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useLanguage();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} data-swipe-back="off" aria-labelledby="store-offer-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-line bg-surface p-0 text-ink shadow-card backdrop:bg-ink/50">
    <div className="relative">
      {offer.imageUrl && <ImageWithFallback src={offer.imageUrl} alt={t(offer.titleAr, offer.titleEn)} className="aspect-video w-full object-cover" />}
      <button autoFocus type="button" aria-label={t('إغلاق العرض', 'Close offer')} onClick={onClose} className="absolute end-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink shadow-card"><X size={20} /></button>
      {!offer.imageUrl && <div className="flex h-24 items-center justify-center bg-brand-tint"><BadgePercent size={32} className="text-brand" /></div>}
    </div>
    <div className="space-y-4 p-5">
      <p className="text-sm font-bold text-brand">{storeName}</p>
      <h2 id="store-offer-title" className="text-xl font-extrabold">{t(offer.titleAr, offer.titleEn || offer.titleAr)}</h2>
      <p className="whitespace-pre-wrap text-sm leading-7 text-ink-muted">{t(offer.descriptionAr, offer.descriptionEn || offer.descriptionAr)}</p>
      {offer.price != null && offer.price > 0 ? <><p dir="ltr" className="text-xl font-extrabold text-brand">{formatCurrency(offer.price)}</p><button type="button" disabled={!canOrder} onClick={onAdd} className="min-h-12 w-full rounded-xl bg-brand px-4 font-bold text-white disabled:opacity-50">{canOrder ? t('أضف العرض إلى السلة', 'Add offer to cart') : t('المتجر مغلق حالياً', 'Store is closed')}</button></> : <button type="button" onClick={onBrowse} className="min-h-12 w-full rounded-xl bg-brand px-4 font-bold text-white">{t('تصفح منتجات المتجر', 'Browse store products')}</button>}
    </div>
  </dialog>;
}
