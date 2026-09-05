/**
 * Samou Quick — Offers feed screen.
 *
 * Shows standalone promotional offers published by local stores.
 * Customers can tap "اطلب العرض الآن" to add the offer directly to
 * their cart and proceed to checkout.
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgePercent, ChevronLeft, Store as StoreIcon } from 'lucide-react';
import { useLanguage } from '@samou-go/ui';
import { useAllOffers } from '@/hooks/useApi';
import { useCart } from '@/components/CartProvider';
import { ScreenShell } from '@/components/ScreenShell';

export function OffersScreen() {
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';
  const navigate = useNavigate();
  const cart = useCart();
  const offers = useAllOffers();

  const [addedId, setAddedId] = useState<string | null>(null);

  const handleOrderOffer = useCallback(
    (offer: { id: string; storeId: string; titleAr: string; price: number; imageUrl: string | null; storeNameAr?: string }) => {
      cart.addOfferItem(offer, 1, offer.storeNameAr);
      setAddedId(offer.id);
      // Brief feedback then navigate to checkout
      setTimeout(() => {
        navigate('/checkout');
      }, 400);
    },
    [cart, navigate],
  );

  const items = (offers.data?.items ?? []).filter(o => o.price != null && o.price > 0);

  return (
    <ScreenShell title="العروض" subtitle="Offers">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
          <BadgePercent size={22} className="text-brand" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold">{t('عروض المتاجر', 'Store Offers')}</h1>
          <p className="text-xs text-ink-muted">{t('عروض مباشرة للطلب', 'Direct-purchase offers from local stores')}</p>
        </div>
      </div>

      {/* Loading skeleton */}
      {offers.loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-64 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!offers.loading && items.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <BadgePercent size={40} className="mx-auto text-ink-muted/30" />
          <p className="mt-3 text-sm font-bold text-ink-muted">
            {t('لا توجد عروض متاحة حالياً', 'No offers available right now')}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {t('تابع العروض من المتاجر المحلية', 'Stay tuned for offers from local stores')}
          </p>
        </div>
      )}

      {/* Offer cards */}
      <div className="space-y-4">
        {items.map((offer) => (
          <div
            key={offer.id}
            className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-all duration-200 active:scale-[0.98]"
          >
            {/* Offer image */}
            {offer.imageUrl && (
              <div className="relative h-44 w-full overflow-hidden bg-canvas">
                <img
                  src={offer.imageUrl}
                  alt={isArabic ? offer.titleAr : offer.titleEn}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {/* Price badge */}
                <div className="absolute bottom-3 end-3 rounded-xl bg-brand px-3 py-1.5 text-sm font-black text-white shadow-brand">
                  <span dir="ltr">{offer.price} ₪</span>
                </div>
              </div>
            )}

            {/* Offer content */}
            <div className="p-4">
              {/* Store info */}
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10">
                  <StoreIcon size={12} className="text-brand" />
                </div>
                <span className="text-[11px] font-bold text-ink-muted">
                  {t('عرض متجر', 'Store offer')}
                </span>
              </div>

              {/* Title & description */}
              <h3 className="text-sm font-extrabold leading-snug">
                {isArabic ? offer.titleAr : offer.titleEn}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted line-clamp-2">
                {isArabic ? offer.descriptionAr : offer.descriptionEn}
              </p>

              {/* Price (if no image) */}
              {!offer.imageUrl && (
                <div className="mt-2">
                  <span className="rounded-lg bg-brand/10 px-2 py-0.5 text-sm font-black text-brand" dir="ltr">
                    {offer.price} ₪
                  </span>
                </div>
              )}

              {/* Action button */}
              <button
                type="button"
                onClick={() => handleOrderOffer(offer)}
                disabled={addedId === offer.id}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-bold text-white transition-all duration-200 hover:bg-brand-dark active:scale-[0.97] disabled:opacity-70 tap-bounce"
              >
                {addedId === offer.id ? (
                  <span className="text-sm">✓ {t('تمت الإضافة', 'Added')}</span>
                ) : (
                  <>
                    <BadgePercent size={16} />
                    {t('اطلب العرض الآن', 'Order Offer Now')}
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}
