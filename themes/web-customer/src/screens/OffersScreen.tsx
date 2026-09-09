import { Link, useNavigate } from 'react-router-dom';
import { BadgePercent, Store as StoreIcon, Image as ImageIcon, CalendarDays } from 'lucide-react';
import { useLanguage, ImageWithFallback } from '@samou-go/ui';
import { useAllOffers } from '@/hooks/useApi';
import { useCart } from '@/components/CartProvider';
import { ScreenShell } from '@/components/ScreenShell';
import { formatCurrency } from '@/lib/delivery';

export function OffersScreen() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const cart = useCart();
  const offers = useAllOffers();
  const items = (offers.data?.items ?? []).filter(o => o.price != null && o.price > 0);
  return <ScreenShell title="العروض" subtitle="Offers">
    <div className="mb-5"><h2 className="text-xl font-extrabold">{t('عروض تستحق التجربة', 'Offers worth discovering')}</h2><p className="mt-2 text-sm text-ink-muted">{t('تفاصيل العرض وسعره، مباشرة من المتجر.', 'Offer details and prices, directly from the store.')}</p></div>
    {offers.loading && <div role="status" className="skeleton h-64 rounded-2xl" aria-label="جارٍ تحميل العروض" />}
    {offers.error && <div role="alert" className="rounded-2xl border border-line bg-surface p-5"><p>تعذّر تحميل العروض</p><button className="min-h-11 font-bold text-brand" onClick={offers.refresh}>إعادة المحاولة</button></div>}
    {!offers.loading && !offers.error && !items.length && <p className="rounded-2xl border border-line bg-surface p-6 text-center text-ink-muted">لا توجد عروض متاحة حالياً</p>}
    <div className="space-y-5">{items.map(offer => {
      const title = language === 'ar' ? offer.titleAr : offer.titleEn || offer.titleAr;
      const description = language === 'ar' ? offer.descriptionAr : offer.descriptionEn || offer.descriptionAr;
      const image = offer.imageUrl || offer.storeCoverUrl;
      return <article key={offer.id} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <div className="relative h-44 overflow-hidden bg-canvas">
          <ImageWithFallback key={image} src={image ?? ''} alt={offer.imageUrl ? title : offer.storeNameAr ?? 'المتجر'} className="h-full w-full object-cover" fallback={<span className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-muted"><ImageIcon size={32} /><span className="text-xs">لم يضف المتجر صورة للعرض بعد</span></span>} />
          <span className="absolute inset-s-3 top-3 flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white"><BadgePercent size={14} />عرض متجر</span>
          {!offer.imageUrl && image && <span className="absolute bottom-3 inset-e-3 rounded-lg bg-surface px-2 py-1 text-xs text-ink">صورة المتجر</span>}
        </div>
        <div className="space-y-3 p-4">
          <Link to={`/stores/${encodeURIComponent(offer.storeId)}`} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink-muted focus-visible:ring-2 focus-visible:ring-brand">
            <ImageWithFallback key={offer.storeLogoUrl} src={offer.storeLogoUrl ?? ''} alt={`شعار ${offer.storeNameAr ?? 'المتجر'}`} className="size-9 rounded-xl object-cover" fallback={<span className="flex h-full w-full items-center justify-center bg-brand/10 text-brand"><StoreIcon size={18} /></span>} />
            {offer.storeNameAr || t('عرض المتجر', 'View store')}
          </Link>
          <div className="flex items-start justify-between gap-3"><h3 className="text-lg font-extrabold leading-7">{title}</h3><span dir="ltr" className="shrink-0 rounded-xl bg-brand/10 px-3 py-2 text-base font-extrabold text-brand">{formatCurrency(offer.price!)}</span></div>
          <p className="whitespace-pre-wrap text-sm leading-7 text-ink-muted">{description || t('تواصل مع المتجر لمعرفة تفاصيل العرض.', 'Contact the store for offer details.')}</p>
          {offer.expiresAt && <p className="flex items-center gap-2 text-xs text-ink-muted"><CalendarDays size={15} />ينتهي في {new Date(offer.expiresAt).toLocaleDateString(language === 'ar' ? 'ar-PS' : 'en-GB')}</p>}
          <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2" onClick={() => { cart.addOfferItem({ ...offer, price: offer.price! }, 1, offer.storeNameAr); navigate('/cart'); }}><BadgePercent size={18} />{t('أضف العرض إلى السلة', 'Add offer to cart')}</button>
        </div>
      </article>;
    })}</div>
  </ScreenShell>;
}
