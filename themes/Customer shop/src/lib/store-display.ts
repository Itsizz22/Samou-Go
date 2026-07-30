/**
 * Samou' Go — turning an API `Store` into something a card can render.
 *
 * `GET /api/v1/stores` returns exactly what the database holds: names, phone,
 * logo, `isActive`. The home screen also wants a monogram, a colour and a
 * category chip. Rather than invent those on the server or hardcode them per
 * store, they are derived here — deterministically, so a store looks the same on
 * every device and every reload.
 *
 * SCHEMA GAP, deliberately not faked: there is no `storeType` column and no
 * ratings table. `classifyStore` reads the store's own name, which is how a
 * shopkeeper in Samou' already advertises what they are ("صيدلية السموع"). When
 * `Store.storeType` lands in Prisma, delete `CATEGORY_KEYWORDS` and read the
 * column. Ratings are simply not displayed — an invented 4.8 is worse than none.
 */

import type { Store } from '@samou-go/shared-types';

export type StoreCategoryKey = 'all' | 'restaurant' | 'supermarket' | 'pharmacy' | 'cafe' | 'shop';

export interface StoreCategory {
  key: StoreCategoryKey;
  ar: string;
  en: string;
}

/** The chip row, in display order. `all` is the default selection. */
export const STORE_CATEGORIES: readonly StoreCategory[] = [
  { key: 'all', ar: 'الكل', en: 'All' },
  { key: 'restaurant', ar: 'مطاعم', en: 'Restaurants' },
  { key: 'supermarket', ar: 'سوبرماركت', en: 'Supermarkets' },
  { key: 'pharmacy', ar: 'صيدليات', en: 'Pharmacies' },
  { key: 'cafe', ar: 'مقاهي', en: 'Cafés' },
  { key: 'shop', ar: 'محلات', en: 'Local Stores' },
];

/**
 * Arabic first — that is what the stores actually call themselves.
 * `shop` is the fallback and therefore carries no keywords.
 */
const CATEGORY_KEYWORDS: Record<Exclude<StoreCategoryKey, 'all' | 'shop'>, readonly string[]> = {
  restaurant: ['مطعم', 'مطاعم', 'شاورما', 'فلافل', 'مشاوي', 'بروست', 'برجر', 'restaurant', 'shawarma', 'grill', 'burger'],
  supermarket: ['سوبرماركت', 'ماركت', 'بقالة', 'تسوق', 'ميني', 'supermarket', 'market', 'grocery', 'mart'],
  pharmacy: ['صيدلية', 'صيدليات', 'pharmacy', 'pharma'],
  cafe: ['مقهى', 'مقاهي', 'كافيه', 'قهوة', 'café', 'cafe', 'coffee'],
};

/** Best-effort category for a store, from its own bilingual name. */
export function classifyStore(store: Pick<Store, 'nameAr' | 'nameEn'>): StoreCategoryKey {
  const haystack = `${store.nameAr} ${store.nameEn}`.toLowerCase();
  for (const [key, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return key as StoreCategoryKey;
    }
  }
  return 'shop';
}

export function categoryLabel(key: StoreCategoryKey): StoreCategory {
  return STORE_CATEGORIES.find((category) => category.key === key) ?? STORE_CATEGORIES[0]!;
}

/**
 * Up to two initials for the card monogram.
 * Prefers the Latin name because Arabic initials read as fragments of a word.
 */
export function storeInitials(store: Pick<Store, 'nameAr' | 'nameEn'>): string {
  const source = store.nameEn.trim() || store.nameAr.trim();
  const words = source.split(/\s+/).filter((word) => !STOP_WORDS.has(word.toLowerCase()));
  const letters = (words.length > 0 ? words : [source]).slice(0, 2).map((word) => [...word][0] ?? '');
  return letters.join('').toUpperCase() || '؟';
}

/** Words that carry no identity and make for a poor monogram. */
const STOP_WORDS = new Set(['al', 'al-', 'the', 'and', 'of', '&', 'abu', 'أبو', 'ال']);

/**
 * Palette per category, using design-system tokens only (DESIGN_SYSTEM.md §3).
 * `gradient` fills the featured card header; `tint` the small nearby-list tile.
 */
const CATEGORY_PALETTE: Record<StoreCategoryKey, { gradient: string; tint: string }> = {
  all: { gradient: 'from-brand-dark to-brand-soft', tint: 'bg-brand-tint text-brand-deep' },
  restaurant: { gradient: 'from-warning to-warning-tint', tint: 'bg-warning-tint text-warning-ink' },
  supermarket: { gradient: 'from-brand-dark to-brand-soft', tint: 'bg-brand-tint text-brand-deep' },
  pharmacy: { gradient: 'from-info to-info-tint', tint: 'bg-info-tint text-info-ink' },
  cafe: { gradient: 'from-warning-ink to-warning', tint: 'bg-warning-tint text-warning-ink' },
  shop: { gradient: 'from-brand-deep to-brand', tint: 'bg-canvas text-ink-soft' },
};

export function storeGradient(key: StoreCategoryKey): string {
  return CATEGORY_PALETTE[key].gradient;
}

export function storeTint(key: StoreCategoryKey): string {
  return CATEGORY_PALETTE[key].tint;
}

/** Everything a card needs, computed once per store. */
export interface StoreCardModel {
  store: Store;
  category: StoreCategory;
  initials: string;
  gradient: string;
  tint: string;
}

export function toStoreCardModel(store: Store): StoreCardModel {
  const key = classifyStore(store);
  return {
    store,
    category: categoryLabel(key),
    initials: storeInitials(store),
    gradient: storeGradient(key),
    tint: storeTint(key),
  };
}
