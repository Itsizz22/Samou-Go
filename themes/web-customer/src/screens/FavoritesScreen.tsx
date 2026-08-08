import { AlertTriangle, Heart, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignInGate, useAuth } from '@/hooks/useApi';
import { ScreenShell } from '@/components/ScreenShell';
import { useFavorites } from '@/components/FavoritesProvider';
import { toStoreCardModel } from '@/lib/store-display';

/**
 * Samou' Go — `/favorites`.
 *
 * The signed-in customer's server-backed favorites. Every heart across the app
 * (home feed, store detail) is the same source of truth as this list, so a
 * removal here is instantly reflected everywhere. Guests see the sign-in gate —
 * a favorite is tied to an account and cannot be saved anonymously.
 */
export function FavoritesScreen() {
  const auth = useAuth();
  const favorites = useFavorites();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);

  const cards = favorites.stores.map(toStoreCardModel);

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await favorites.reload();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <ScreenShell title="المفضلة" subtitle="Favorites">
      {!auth.ready ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-brand" aria-label="Loading" />
        </div>
      ) : !auth.user ? (
        <SignInGate
          auth={auth}
          reasonAr="سجّل الدخول لحفظ متاجرك المفضلة"
          reasonEn="Sign in to save your favorite stores"
        />
      ) : favorites.error ? (
        <div className="rounded-2xl border border-danger-tint bg-surface p-5 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-tint text-danger-ink">
            <AlertTriangle size={22} />
          </span>
          <h1 className="mt-3 text-sm font-extrabold">تعذّر تحميل المفضلة</h1>
          <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
            Could not load favorites
          </p>
          <p className="mt-2 text-xs text-ink-soft">{favorites.error.message}</p>
          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={retrying}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
          >
            {retrying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} إعادة المحاولة
          </button>
        </div>
      ) : favorites.loading && cards.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-brand" aria-label="Loading" />
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-surface text-brand">
            <Heart size={26} />
          </span>
          <h2 className="mt-4 text-sm font-extrabold">لا توجد متاجر مفضلة بعد</h2>
          <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
            No saved stores yet
          </p>
          <p className="mt-3 text-xs text-ink-soft">
            اضغط على القلب في أي متجر لتجده هنا لاحقاً
          </p>
        </div>
      ) : (
        <section className="space-y-3" aria-live="polite">
          {cards.map(({ store, tint, initials }) => (
            <article
              key={store.id}
              onClick={() => navigate(`/stores/${encodeURIComponent(store.id)}`)}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card transition active:scale-[0.99]"
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-black ${tint}`}
              >
                {store.logoUrl ? (
                  <img src={store.logoUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0 flex-1 text-end">
                <h3 className="truncate text-sm font-extrabold">{store.nameAr}</h3>
                <p className="truncate text-[11px] text-ink-muted" dir="ltr">
                  {store.nameEn}
                </p>
              </div>
              <button
                type="button"
                aria-label={`إزالة ${store.nameAr} من المفضلة`}
                aria-pressed
                onClick={(event) => {
                  event.stopPropagation();
                  void favorites.toggle(store.id);
                }}
                disabled={favorites.pending.includes(store.id)}
                className="shrink-0 rounded-full bg-danger-tint p-2.5 text-danger-ink transition active:scale-90 disabled:opacity-60"
              >
                <Heart size={16} fill="currentColor" />
              </button>
            </article>
          ))}
        </section>
      )}
    </ScreenShell>
  );
}
