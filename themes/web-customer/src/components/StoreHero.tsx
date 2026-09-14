import type { Store as StoreModel } from '@samou-go/shared-types';
import { StoreStatus, formatWhatsAppLink } from '@samou-go/shared-types';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
import { ArrowRight, Clock3, Heart, MessageCircle, ShoppingCart, Star, Store, Truck } from 'lucide-react';
import { DeliveryEstimate } from './DeliveryEstimate';
import { storeIsOpen } from './StoreHours';

interface StoreHeroProps {
  store: StoreModel;
  favorite: boolean;
  favoritePending: boolean;
  itemCount: number;
  onBack: () => void;
  onFavorite: () => void;
  onCart: () => void;
}

export function StoreHero({ store, favorite, favoritePending, itemCount, onBack, onFavorite, onCart }: StoreHeroProps) {
  const { t } = useLanguage();
  const open = storeIsOpen(store);
  return (
    <header className="sq-store-hero">
      <div className="sq-store-hero-scene safe-top">
        {store.coverUrl && <ImageWithFallback src={store.coverUrl} alt="" className="sq-store-hero-cover" />}
        <div className="sq-store-hero-shade" aria-hidden="true" />
        <nav aria-label={t('التنقل في المتجر', 'Store navigation')} className="sq-store-hero-actions">
          <button type="button" className="sq-store-hero-action" aria-label={t('رجوع', 'Back')} onClick={onBack}><ArrowRight size={21} className="rtl:rotate-180" /></button>
          <div className="flex gap-2">
            <button type="button" className="sq-store-hero-action" aria-label={favorite ? t('إزالة من المفضلة', 'Remove from favorites') : t('إضافة إلى المفضلة', 'Add to favorites')} aria-pressed={favorite} disabled={favoritePending} onClick={onFavorite}><Heart size={20} fill={favorite ? 'currentColor' : 'none'} /></button>
            <button type="button" className="sq-store-hero-action relative" aria-label={t(`السلة (${itemCount})`, `Cart (${itemCount})`)} onClick={onCart}>
              <ShoppingCart size={20} />
              {itemCount > 0 && <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-micro font-bold text-white" dir="ltr">{itemCount > 99 ? '99+' : itemCount}</span>}
            </button>
          </div>
        </nav>
        <div className="sq-store-hero-identity">
          <div className="sq-store-hero-logo">
            {store.logoUrl ? <ImageWithFallback src={store.logoUrl} alt={t(`شعار ${store.nameAr}`, `${store.nameEn || store.nameAr} logo`)} className="h-full w-full object-contain" /> : <Store size={42} aria-hidden="true" />}
          </div>
          <h1>{t(store.nameAr, store.nameEn)}</h1>
          <div className="sq-store-hero-facts">
            <span className={`sq-store-hero-status ${open ? 'is-open' : ''}`}><span aria-hidden="true" />{!open ? t('مغلق', 'Closed') : store.storeStatus === StoreStatus.BUSY ? t('مشغول', 'Busy') : t('مفتوح', 'Open')}</span>
            {store.openingTime && <span className="inline-flex items-center gap-1.5"><Clock3 size={14} /><span dir="ltr">{store.openingTime}{store.closingTime ? ` – ${store.closingTime}` : ''}</span></span>}
            {open && store.deliveryEstimate && <span className="inline-flex items-center gap-1.5"><Truck size={15} /><span><b dir="ltr">{store.deliveryEstimate.minMinutes}–{store.deliveryEstimate.maxMinutes}</b> {t('دقيقة', 'min')}</span></span>}
          </div>
        </div>
      </div>
      <div className="sq-store-hero-details">
        <DeliveryEstimate store={store} />
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {store.isRecommended && <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-dark"><Star size={13} fill="currentColor" />{t('موصى به لدينا', 'Recommended')}</span>}
          {store.phone && <a href={formatWhatsAppLink(store.whatsappNumber || store.phone, `مرحباً، أريد الاستفسار عن متجر ${store.nameAr}`)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-tint px-4 text-xs font-bold text-brand-dark focus-visible:outline-2 focus-visible:outline-brand"><MessageCircle size={15} />{t('تواصل مع المتجر', 'Contact store')}<span dir="ltr">{store.phone}</span></a>}
          {store.publicCode && <span className="text-micro text-ink-muted">{t('رقم المتجر', 'Store code')}: <span dir="ltr">{store.publicCode}</span></span>}
        </div>
      </div>
    </header>
  );
}
