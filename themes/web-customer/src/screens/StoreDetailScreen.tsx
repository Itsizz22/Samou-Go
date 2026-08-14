/**
 * `/stores/:storeId` — a store's full catalogue with add-to-cart.
 *
 * The single-source catalogue endpoint `GET /stores/:id` returns categories
 * with their products inlined; the screen renders one sticky category bar and
 * a stepper per product. Basket state lives in the shared CartProvider.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowRight, Heart, Loader2, Minus, Plus, RefreshCw, ShoppingCart } from 'lucide-react';
import { useCart } from '@/components/CartProvider';
import { useFavorites } from '@/components/FavoritesProvider';
import { useStore } from '@/hooks/useApi';
import { HorizontalScrollGallery } from '@samou-go/ui';
import { ProductRowSkeleton, Skeleton } from '@/components/Skeleton';
import { formatCurrency } from '@/lib/delivery';
import { hapticConfirm, hapticTap } from '@/hooks/useApi';
import { PageTransition } from '@/components/PageTransition';

export function StoreDetailScreen() {
  const { storeId = '' } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const store = useStore(storeId);
  const cart = useCart();
  const favorites = useFavorites();

  const handleToggleFavorite = async () => {
    const toggled = await favorites.toggle(storeId);
    if (!toggled) navigate('/favorites');
  };

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const categories = store.data?.categories ?? [];

  const active = useMemo(
    () => activeCategoryId ?? categories[0]?.id ?? null,
    [activeCategoryId, categories]
  );

  if (store.loading && !store.data) {
    return (
      <PageTransition>
        <main dir="rtl" className="min-h-screen bg-canvas pb-24 text-ink">
          <div className="safe-top bg-brand px-5 pb-5 pt-4 text-white">
            <div className="mx-auto max-w-md">
              <Skeleton className="h-4 w-24 bg-white/30" />
              <Skeleton className="mt-2 h-6 w-40 bg-white/30" />
            </div>
          </div>
          <div className="mx-auto max-w-md space-y-3 px-5 pt-6">
            {[0, 1, 2, 3, 4].map((index) => (
              <ProductRowSkeleton key={index} />
            ))}
          </div>
        </main>
      </PageTransition>
    );
  }

  if (store.error && !store.data) {
    return (
      <PageTransition>
        <main dir="rtl" className="min-h-screen bg-canvas pb-24 text-ink">
          <div className="mx-auto max-w-md px-5 pt-16 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
              <AlertTriangle size={22} />
            </span>
            <h1 className="mt-4 text-sm font-extrabold">تعذّر تحميل المتجر <span dir="ltr">/ Failed to load store</span></h1>
            <p className="mt-1 text-xs text-ink-soft">{store.error.message}</p>
            <button
              type="button"
              onClick={store.refresh}
              disabled={store.refreshing}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
            >
              {store.refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} إعادة المحاولة
            </button>
          </div>
        </main>
      </PageTransition>
    );
  }

  const current = store.data!;
  const products = active
    ? categories.find((category) => category.id === active)?.products ?? []
    : [];

  const handleAdd = (productId: string, product: (typeof products)[number]) => {
    const line = cart.lineFor(productId);
    if (line) {
      cart.setQuantity(productId, line.quantity + 1);
    } else {
      cart.addItem(product, 1);
      cart.setStore(current.id, current.nameAr);
    }
    void hapticConfirm();
  };

  return (
    <PageTransition>
      <main dir="rtl" className="min-h-screen bg-canvas pb-28 text-ink">
        <header className="safe-top bg-brand px-5 pb-4 pt-4 text-white">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <button
              type="button"
              aria-label="رجوع / Back"
              onClick={() => navigate(-1)}
              className="rounded-full p-2 transition hover:bg-surface/15 active:scale-95"
            >
              <ArrowRight size={22} />
            </button>
            <div className="min-w-0 flex-1 text-end">
              <h1 className="truncate text-lg font-extrabold">{current.nameAr}</h1>
              <p className="truncate text-[11px] text-white/80" dir="ltr">
                {current.nameEn} · {current.phone}
              </p>
            </div>
            <button
              type="button"
              aria-label={
                favorites.isFavorite(storeId) ? 'إزالة من المفضلة / Remove from favorites' : 'إضافة إلى المفضلة / Add to favorites'
              }
              aria-pressed={favorites.isFavorite(storeId)}
              onClick={() => void handleToggleFavorite()}
              disabled={favorites.pending.includes(storeId)}
              className="rounded-full p-2 text-white transition hover:bg-surface/15 active:scale-95 disabled:opacity-60"
            >
              <Heart size={20} fill={favorites.isFavorite(storeId) ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              aria-label={`السلة (${cart.itemCount})`}
              onClick={() => navigate('/cart')}
              className="relative rounded-full p-2 transition hover:bg-surface/15 active:scale-95"
            >
              <ShoppingCart size={20} />
              <AnimatePresence>
                {cart.itemCount > 0 && (
                  <motion.span
                    key={cart.itemCount}
                    initial={{ scale: 0.4 }}
                    animate={{ scale: [0.4, 1.15, 0.92, 1] }}
                    transition={{ duration: 0.45 }}
                    className="absolute -top-0.5 -end-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
                  >
                    {cart.itemCount > 99 ? '99+' : cart.itemCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </header>

        {/* Quick-browse rail — horizontal scrollable categories */}
        <HorizontalScrollGallery
          titleAr="فئات المتجر"
          titleEn="Categories"
          ariaLabel="فئات المتجر"
          trackClassName="gap-2"
          showArrows={categories.length > 1}
        >
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                setActiveCategoryId(category.id);
                void hapticTap();
              }}
              aria-pressed={category.id === active}
              className={`flex shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                category.id === active ? 'bg-brand text-white' : 'bg-canvas text-ink-muted'
              }`}
            >
              {category.nameAr}
            </button>
          ))}
        </HorizontalScrollGallery>

        <div className="mx-auto max-w-md px-5 pt-5">
          {products.length === 0 ? (
            <p className="py-12 text-center text-xs text-ink-muted">
              لا توجد منتجات في هذه الفئة حالياً
            </p>
          ) : (
            <div className="space-y-3">
              {products
                .filter((product) => product.isAvailable)
                .map((product, index) => {
                  const line = cart.lineFor(product.id);
                  return (
                    <motion.article
                      key={product.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.04, 0.4) }}
                      className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card"
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-16 w-16 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-lg font-black text-brand-dark">
                          {product.nameAr.slice(0, 2)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1 text-end">
                        <h3 className="truncate text-sm font-extrabold">{product.nameAr}</h3>
                        {product.description && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-muted">
                            {product.description}
                          </p>
                        )}
                        <p className="mt-1 text-sm font-bold text-brand-dark" dir="ltr">
                          {formatCurrency(product.price)}
                        </p>
                      </div>
                      {line ? (
                        <div className="flex shrink-0 items-center gap-2 rounded-full bg-brand px-1.5 py-1 text-white">
                          <button
                            type="button"
                            aria-label="إنقاص / Decrease"
                            onClick={() => {
                              cart.setQuantity(product.id, line.quantity - 1);
                              void hapticTap();
                            }}
                            className="rounded-full p-1 transition active:scale-90"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="min-w-[18px] text-center text-xs font-bold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="زيادة / Increase"
                            onClick={() => {
                              cart.setQuantity(product.id, line.quantity + 1);
                              void hapticTap();
                            }}
                            className="rounded-full p-1 transition active:scale-90"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label={`أضف ${product.nameAr} إلى السلة`}
                          onClick={() => handleAdd(product.id, product)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-dark transition active:scale-90"
                        >
                          <Plus size={18} strokeWidth={2.5} />
                        </button>
                      )}
                    </motion.article>
                  );
                })}
            </div>
          )}
        </div>

        <AnimatePresence>
          {cart.itemCount > 0 && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="fixed inset-x-0 bottom-16 z-20 px-5"
            >
              <button
                type="button"
                onClick={() => navigate('/cart')}
                className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl bg-brand px-5 py-3.5 text-white shadow-brand transition active:scale-[0.98]"
              >
                <span className="flex items-center gap-2 text-sm font-extrabold">
                  <ShoppingCart size={17} /> عرض السلة
                </span>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">
                  {cart.itemCount} · {formatCurrency(cart.subtotal)}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </PageTransition>
  );
}
