import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Heart, Store as StoreIcon, Star, Truck } from 'lucide-react';
import { useLanguage, type StoreCardModel } from '@samou-go/ui';
import type { Store } from '@samou-go/shared-types';
import { storeIsOpen } from '../StoreHours';
import { DeliveryEstimate } from '../DeliveryEstimate';

export function ResponsiveStoreImage({
  src,
  name,
  cover = false,
  eager = false,
}: {
  src?: string | null;
  name: string;
  cover?: boolean;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Only the versioned upload pipeline guarantees these derivatives exist.
  const responsive = src?.endsWith('-responsive.webp');
  const displaySrc = responsive ? src.replace(/\.webp$/, cover ? '-lg.webp' : '-sm.webp') : src;
  return (
    <span className={`market-image ${cover ? 'market-image--cover' : 'market-image--logo'}`}>
      {src && !failed ? (
        <img
          src={displaySrc}
          alt={name}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          width={cover ? 640 : 160}
          height={cover ? 360 : 160}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={loaded ? 'is-loaded' : ''}
        />
      ) : (
        <StoreIcon size={cover ? 40 : 26} aria-hidden="true" />
      )}
    </span>
  );
}
export function StoreStatusBadge({ store }: { store: Store }) {
  const { t } = useLanguage();
  const open = storeIsOpen(store);
  return (
    <span className={`market-status ${open ? 'is-open' : ''}`}>
      <span aria-hidden="true">●</span>
      {open ? t('مفتوح الآن', 'Open now') : t('مغلق', 'Closed')}
    </span>
  );
}
function StoreMeta({ store, freeDelivery }: { store: Store; freeDelivery: boolean }) {
  const { t } = useLanguage();
  return (
    <div className="market-meta">
      <StoreStatusBadge store={store} />
      <DeliveryEstimate store={store} compact />
      {store.averageRating != null && (store.ratingCount ?? 0) > 0 && (
        <span>
          <Star size={13} />
          <b dir="ltr">{store.averageRating.toFixed(1)}</b>
        </span>
      )}
      {freeDelivery && (
        <span className="text-brand">
          <Truck size={14} />
          {t('توصيل مجاني', 'Free delivery')}
        </span>
      )}
    </div>
  );
}
export function FeaturedStoreCard({
  card,
  favorite,
  pending,
  onFavorite,
  freeDelivery,
  eager,
}: {
  card: StoreCardModel;
  favorite: boolean;
  pending: boolean;
  onFavorite: () => void;
  freeDelivery: boolean;
  eager: boolean;
}) {
  const { store, category } = card;
  const { t } = useLanguage();
  const name = t(store.nameAr, store.nameEn);
  return (
    <article className="market-featured-card">
      <Link
        to={`/stores/${encodeURIComponent(store.id)}`}
        className="market-card-link"
        aria-label={t(`فتح متجر ${name}`, `Open ${name}`)}
      >
        <ResponsiveStoreImage
          key={store.coverUrl}
          src={store.coverUrl}
          name={t(`غلاف ${name}`, `${name} cover`)}
          cover
          eager={eager}
        />
        <div className="market-featured-body">
          <div className="market-identity">
            <ResponsiveStoreImage
              key={store.logoUrl}
              src={store.logoUrl}
              name={name}
              eager={eager}
            />
            <div>
              <h3>{name}</h3>
              <p>{t(category.ar, category.en)}</p>
            </div>
          </div>
          <StoreMeta store={store} freeDelivery={freeDelivery} />
          {store.isRecommended && (
            <span className="market-recommended">
              <Star size={12} />
              {t('موصى به', 'Recommended')}
            </span>
          )}
        </div>
      </Link>
      <button
        type="button"
        className="market-favorite"
        aria-label={
          favorite
            ? t(`إزالة ${name} من المفضلة`, `Remove ${name} from favorites`)
            : t(`إضافة ${name} للمفضلة`, `Favorite ${name}`)
        }
        aria-pressed={favorite}
        disabled={pending}
        onClick={onFavorite}
      >
        <Heart size={20} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}
export function StoreCard({ card, freeDelivery }: { card: StoreCardModel; freeDelivery: boolean }) {
  const { t } = useLanguage();
  const { store, category } = card;
  const name = t(store.nameAr, store.nameEn);
  return (
    <Link
      to={`/stores/${encodeURIComponent(store.id)}`}
      className="market-store-card"
      aria-label={t(`فتح متجر ${name}`, `Open ${name}`)}
    >
      <ResponsiveStoreImage key={store.logoUrl} src={store.logoUrl} name={name} />
      <div className="market-store-copy">
        <h3>{name}</h3>
        <p>{t(category.ar, category.en)}</p>
        <StoreMeta store={store} freeDelivery={freeDelivery} />
      </div>
      <ChevronLeft
        size={18}
        className="shrink-0 text-ink-muted ltr:rotate-180"
        aria-hidden="true"
      />
    </Link>
  );
}
export function StoreCardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={featured ? 'market-featured-card skeleton' : 'market-store-card skeleton'}
    >
      {featured && <div className="aspect-video bg-line-soft" />}
      <div className="flex gap-3 p-4">
        <span className="size-16 shrink-0 rounded-xl bg-line-soft" />
        <div className="flex-1 space-y-3">
          <div className="h-4 w-3/4 rounded bg-line-soft" />
          <div className="h-3 w-1/2 rounded bg-line-soft" />
        </div>
      </div>
    </div>
  );
}
