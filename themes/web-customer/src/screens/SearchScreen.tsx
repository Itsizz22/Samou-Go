import { useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search as SearchIcon, Store as StoreIcon } from 'lucide-react';
import { useStores } from '@/hooks/useApi';
import { ScreenShell } from '@/components/ScreenShell';

/**
 * Samou' Go — `/search`.
 *
 * Server-side store search reusing the same `useStores` hook as the home feed.
 * Kept intentionally small: category chips and cards live on the home screen.
 */
export function SearchScreen() {
  const [term, setTerm] = useState('');

  const stores = useStores(
    useMemo(
      () => ({
        activeOnly: true,
        pageSize: 24,
        ...(term.trim() ? { search: term.trim() } : {}),
      }),
      [term]
    )
  );

  const results = stores.data?.items ?? [];

  return (
    <ScreenShell title="بحث" subtitle="Search">
      <form
        role="search"
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          setTerm(term.trim());
        }}
      >
        <label className="flex h-14 cursor-text items-center gap-3 rounded-2xl bg-surface px-4 text-ink-muted shadow-raised">
          <SearchIcon size={20} className="text-brand" />
          <input
            value={term}
            onChange={event => setTerm(event.target.value)}
            autoFocus
            enterKeyHint="search"
            aria-controls="search-results"
            placeholder="ابحث عن متاجر أو منتجات…"
            aria-label="Search stores or products"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-subtle"
          />
          {stores.refreshing && (
            <Loader2 size={16} className="shrink-0 animate-spin text-brand" aria-label="Searching" />
          )}
        </label>
      </form>

      <section id="search-results" className="mt-6 space-y-3" aria-live="polite">
        {stores.loading ? (
          [0, 1, 2].map(index => (
            <div
              key={index}
              className="flex animate-pulse items-center gap-3 rounded-2xl bg-surface p-3 shadow-card"
            >
              <div className="h-12 w-12 shrink-0 rounded-xl bg-line-soft" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded bg-line-soft" />
                <div className="h-2.5 w-1/2 rounded bg-line-soft" />
              </div>
            </div>
          ))
        ) : stores.error ? (
          <div className="rounded-2xl border border-danger-tint bg-surface p-5 text-center shadow-card">
            <p className="text-sm font-extrabold">تعذّر البحث</p>
            <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
              Search failed
            </p>
            <p className="mt-2 text-xs text-ink-soft">{stores.error.message}</p>
            <button
              type="button"
              onClick={stores.refresh}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-dark"
            >
              <RefreshCw size={14} />
              إعادة المحاولة
            </button>
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
              <StoreIcon size={22} />
            </span>
            <h2 className="mt-3 text-sm font-extrabold">
              {term.trim() ? 'لا توجد نتائج مطابقة' : 'اكتب اسم متجر للبحث'}
            </h2>
            <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
              {term.trim() ? 'No matching stores' : 'Type a store name to search'}
            </p>
          </div>
        ) : (
          results.map(store => (
            <article key={store.id} className="rounded-2xl bg-surface p-3 shadow-card">
              <h3 className="truncate text-sm font-extrabold text-end">{store.nameAr}</h3>
              <p className="mt-0.5 truncate text-[11px] text-ink-muted" dir="ltr">
                {store.nameEn}
              </p>
            </article>
          ))
        )}
      </section>
    </ScreenShell>
  );
}
