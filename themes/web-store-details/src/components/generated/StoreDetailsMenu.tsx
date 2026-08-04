/**
 * Samou' Go — store details & product menu.
 *
 * Loads a real store catalogue from `GET /stores/:id`, driven by a `?storeId=`
 * URL param. Category tabs filter client-side (the schema has no store-type
 * column yet). The "View Cart" button links to the checkout app, carrying
 * `?storeId=` so the checkout pre-selects the same store.
 *
 * This screen is intentionally public — no auth required to browse a menu.
 */

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStore, useStores } from '@/hooks/useApi';
import { formatCurrency } from '@/lib/delivery';
import { HeaderNav } from './HeaderNav';
import { BottomTabs } from './BottomTabs';
import type { CategoryWithProducts } from '@samou-go/shared-types';

/** Where the checkout app is served. Override with VITE_CHECKOUT_URL in .env */
const CHECKOUT_URL: string = (
  import.meta.env.VITE_CHECKOUT_URL ?? 'http://localhost:5175'
).replace(/\/+$/, '');

export const StoreDetailsMenu = () => {
  /* ---- Which store? ------------------------------------------------------ */

  const storeIdParam = useMemo(
    () => new URLSearchParams(window.location.search).get('storeId'),
    []
  );

  // If no storeId param, fall back to the first active store.
  const storeList = useStores(
    { activeOnly: true, pageSize: 1 },
    { enabled: !storeIdParam }
  );
  const storeId = storeIdParam ?? storeList.data?.items[0]?.id ?? null;

  const store = useStore(storeId);

  /* ---- Category filter --------------------------------------------------- */

  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories = useMemo<Array<{ id: string; ar: string; en: string }>>(() => {
    if (!store.data) return [];
    return [
      { id: 'all', ar: 'الكل', en: 'All' },
      ...store.data.categories.map((cat) => ({
        id: cat.id,
        ar: cat.nameAr,
        en: cat.nameEn,
      })),
    ];
  }, [store.data]);

  const visibleCategories = useMemo<CategoryWithProducts[]>(() => {
    if (!store.data) return [];
    if (activeCategory === 'all') return store.data.categories;
    return store.data.categories.filter((cat) => cat.id === activeCategory);
  }, [store.data, activeCategory]);

  const visibleProducts = useMemo(
    () => visibleCategories.flatMap((cat) => cat.products).filter((p) => p.isAvailable),
    [visibleCategories]
  );

  /* ---- Cart -------------------------------------------------------------- */

  const [cartItems, setCartItems] = useState<Record<string, number>>({});

  const updateCart = (productId: string, change: number) => {
    const previousCount = cartItems[productId] ?? 0;
    setCartItems((current) => {
      const nextCount = Math.max(0, (current[productId] ?? 0) + change);
      if (nextCount === 0) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      return { ...current, [productId]: nextCount };
    });

    // Toast the first time an item lands in the basket
    if (change > 0 && previousCount === 0) {
      const allProducts = store.data?.categories.flatMap((c) => c.products) ?? [];
      const product = allProducts.find((p) => p.id === productId);
      if (product) {
        toast.success(`تمت إضافة ${product.nameAr} إلى السلة`, {
          description: `${product.nameAr} added to cart`,
        });
      }
    }
  };

  const itemCount = Object.values(cartItems).reduce((sum, n) => sum + n, 0);

  /* ---- Loading & error states -------------------------------------------- */

  const loading = store.loading || (!storeIdParam && storeList.loading);
  const error = store.error ?? (!storeIdParam ? storeList.error : null);

  /* ---- Render ------------------------------------------------------------ */

  return (
    <div dir="rtl" className="min-h-screen bg-canvas pb-36 text-ink">
      <HeaderNav
        title="Store Details"
        arabicTitle={store.data?.nameAr ?? 'تفاصيل المتجر'}
        showBack
        showCart
        cartCount={itemCount}
        onBack={() => window.history.back()}
      />

      <main className="mx-auto w-full max-w-lg">
        {/* Store hero */}
        <section aria-labelledby="store-heading" className="bg-surface pb-5">
          {loading ? (
            <div className="h-48 animate-pulse bg-line-soft sm:h-56" aria-hidden="true" />
          ) : store.data?.logoUrl ? (
            <figure className="relative h-48 w-full overflow-hidden sm:h-56">
              <img
                className="h-full w-full object-cover"
                src={store.data.logoUrl}
                alt={store.data.nameEn}
              />
              <figcaption className="absolute bottom-3 end-4 rounded-full bg-surface/95 px-3 py-1 text-xs font-semibold text-brand-deep shadow-card">
                {store.data.isActive ? (
                  <>مفتوح <span dir="ltr">Open</span></>
                ) : (
                  <>مغلق <span dir="ltr">Closed</span></>
                )}
              </figcaption>
            </figure>
          ) : (
            <div className="relative flex h-48 items-center justify-center bg-gradient-to-br from-brand-dark to-brand sm:h-56">
              <span className="text-6xl font-black text-white/30">
                {store.data?.nameAr.slice(0, 1) ?? ''}
              </span>
              <span className="absolute bottom-3 end-4 rounded-full bg-surface/95 px-3 py-1 text-xs font-semibold text-brand-deep shadow-card">
                {store.data?.isActive ? (
                  <>مفتوح <span dir="ltr">Open</span></>
                ) : (
                  <>مغلق <span dir="ltr">Closed</span></>
                )}
              </span>
            </div>
          )}

          <div className="px-5 pt-4">
            {loading ? (
              <div className="space-y-2" aria-hidden="true">
                <div className="ms-auto h-5 w-2/3 animate-pulse rounded bg-line-soft" />
                <div className="ms-auto h-3 w-1/2 animate-pulse rounded bg-line-soft" />
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="store-heading" className="text-xl font-extrabold tracking-[-0.02em] text-ink">
                      {store.data?.nameAr ?? ''}
                    </h2>
                    <p className="mt-1 text-sm font-medium text-ink-muted" dir="ltr">
                      {store.data?.nameEn ?? ''}
                    </p>
                  </div>
                  {store.data && (
                    <div className="flex shrink-0 items-center gap-1 rounded-full bg-brand-surface px-3 py-1.5 text-sm font-bold text-brand-deep">
                      <Star className="h-4 w-4 fill-warning text-warning" aria-hidden="true" />
                      <span>4.8</span>
                    </div>
                  )}
                </div>
                {store.data && (
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-ink-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-4 w-4 text-brand" aria-hidden="true" />
                      20–30 min · دقيقة
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-brand" aria-hidden="true" />
                      السموع
                    </span>
                    {store.data.phone && (
                      <a
                        href={`tel:${store.data.phone}`}
                        className="inline-flex items-center gap-1.5 font-semibold text-brand-dark hover:underline"
                        dir="ltr"
                      >
                        {store.data.phone}
                      </a>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Error state */}
        {error && (
          <section className="px-5 pt-7" aria-live="assertive">
            <div className="rounded-xl border border-danger-tint bg-surface p-5 text-center shadow-card">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
                <AlertTriangle size={22} />
              </span>
              <h3 className="mt-3 text-sm font-extrabold">تعذّر تحميل قائمة المتجر</h3>
              <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
                Could not load the store menu
              </p>
              <p className="mt-2 text-xs text-ink-soft">{error.message}</p>
              <button
                type="button"
                onClick={storeIdParam ? store.refresh : storeList.refresh}
                disabled={store.refreshing || storeList.refreshing}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
              >
                {store.refreshing || storeList.refreshing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                إعادة المحاولة <span dir="ltr">Retry</span>
              </button>
            </div>
          </section>
        )}

        {/* Category tabs */}
        {(loading || (!error && categories.length > 0)) && (
          <section aria-labelledby="categories-heading" className="px-5 pt-7">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-brand">
                  Shop by aisle
                </p>
                <h2 id="categories-heading" className="text-lg font-extrabold text-ink">
                  Categories <span className="font-medium text-ink-muted">/ الأقسام</span>
                </h2>
              </div>
              <ChevronRight className="h-5 w-5 text-ink-subtle rtl:rotate-180" aria-hidden="true" />
            </div>
            <nav
              aria-label="Store categories"
              className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1"
            >
              {loading
                ? [0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-[66px] min-w-[78px] animate-pulse rounded-xl bg-surface shadow-card"
                      aria-hidden="true"
                    />
                  ))
                : categories.map((cat) => {
                    const isActive = activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setActiveCategory(cat.id)}
                        className={`min-w-[78px] rounded-xl border px-3 py-2.5 text-center transition focus:outline-none focus:ring-2 focus:ring-brand/40 ${
                          isActive
                            ? 'border-brand bg-brand text-white'
                            : 'border-line bg-surface text-ink-soft hover:border-brand'
                        }`}
                        aria-pressed={isActive}
                      >
                        <span className="block text-xs font-bold">{cat.en}</span>
                        <span
                          className={`mt-0.5 block text-[11px] ${isActive ? 'text-white/85' : 'text-ink-muted'}`}
                        >
                          {cat.ar}
                        </span>
                      </button>
                    );
                  })}
            </nav>
          </section>
        )}

        {/* Product grid */}
        <section aria-labelledby="products-heading" className="px-5 pt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="products-heading" className="text-lg font-extrabold text-ink">
              Popular products{' '}
              <span className="font-medium text-ink-muted">/ الأكثر طلباً</span>
            </h2>
            {!loading && (
              <span className="text-xs font-semibold text-ink-muted">
                {visibleProducts.length} items
              </span>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-3" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                  <div className="h-32 animate-pulse bg-line-soft" />
                  <div className="space-y-2 p-3">
                    <div className="ms-auto h-3.5 w-2/3 animate-pulse rounded bg-line-soft" />
                    <div className="ms-auto h-3 w-1/2 animate-pulse rounded bg-line-soft" />
                    <div className="h-8 animate-pulse rounded-lg bg-line-soft" />
                  </div>
                </div>
              ))}
            </div>
          ) : !error && visibleProducts.length === 0 ? (
            <div
              className="rounded-xl border border-line bg-surface p-6 text-center shadow-card"
              aria-live="polite"
            >
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
                <Package size={22} />
              </span>
              <h3 className="mt-3 text-sm font-extrabold">لا توجد منتجات في هذا القسم</h3>
              <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
                No products in this category
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {visibleProducts.map((product) => {
                const quantity = cartItems[product.id] ?? 0;
                return (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-xl border border-line bg-surface shadow-card"
                  >
                    <div className="h-32 bg-brand-surface p-3">
                      {product.imageUrl ? (
                        <img
                          className="h-full w-full rounded-lg object-cover"
                          src={product.imageUrl}
                          alt={product.nameAr}
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center rounded-lg bg-canvas text-2xl font-black text-ink-muted">
                          {product.nameAr.slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="line-clamp-1 text-sm font-bold text-ink">
                        {product.nameAr}
                      </h3>
                      {product.description && (
                        <p className="mt-1 line-clamp-1 text-xs text-ink-muted">
                          {product.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="text-sm font-extrabold text-brand-deep">
                          <span className="text-[11px] font-semibold">ILS</span>{' '}
                          {formatCurrency(product.price, { unit: 'none' })}
                        </p>
                        {quantity > 0 ? (
                          <div
                            className="flex items-center gap-2 rounded-lg bg-brand-surface px-1.5 py-1 text-brand-deep"
                            aria-label={`${quantity} ${product.nameAr} in cart`}
                          >
                            <button
                              type="button"
                              onClick={() => updateCart(product.id, -1)}
                              className="rounded-md p-0.5 transition hover:bg-surface"
                              aria-label={`Remove one ${product.nameAr}`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-3 text-center text-xs font-bold">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCart(product.id, 1)}
                              className="rounded-md p-0.5 transition hover:bg-surface"
                              aria-label={`Add one ${product.nameAr}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateCart(product.id, 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white transition hover:bg-brand-dark active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand/40"
                            aria-label={`Add ${product.nameAr} to cart`}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* View Cart CTA — links to checkout app with storeId */}
      {itemCount > 0 && storeId && (
        <aside
          className="fixed bottom-[72px] end-4 start-4 z-40 mx-auto max-w-lg"
          aria-label="Shopping cart summary"
        >
          <a
            href={`${CHECKOUT_URL}/?storeId=${encodeURIComponent(storeId)}`}
            className="flex w-full items-center justify-between rounded-xl bg-brand-deep px-4 py-3.5 text-white shadow-raised transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
          >
            <span className="flex flex-col items-start">
              <strong className="text-sm">
                View Cart ({itemCount} {itemCount === 1 ? 'item' : 'items'})
              </strong>
              <span className="mt-0.5 text-xs text-white/75">عرض السلة</span>
            </span>
            <span className="flex items-center gap-1 text-sm font-bold">
              <span>Go</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </a>
        </aside>
      )}

      <BottomTabs activeTab="home" />
    </div>
  );
};
