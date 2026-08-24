/**
 * Samou' Go — turning an API `Store` into something a card can render.
 *
 * `GET /api/v1/stores` returns exactly what the database holds: names, phone,
 * logo, `isActive`. The home screen also wants a monogram, a colour and a
 * category chip.
 *
 * Uses `Store.storeType` (the Prisma enum column) when set. Falls back to
 * keyword-based classification from the store name for legacy stores that
 * were created before `storeType` existed.
 */

import type { Store, StoreType } from '@samou-go/shared-types';

export type StoreCategoryKey = 'all' | 'restaurant' | 'cafe' | 'supermarket' | 'shop' | 'bakery_sweets' | 'butchery' | 'vegetables_fruits';

export interface StoreCategory {
  key: StoreCategoryKey;
  ar: string;
  en: string;
}

/** The chip row, in display order. `all` is the default selection. */
export const STORE_CATEGORIES: readonly StoreCategory[] = [
  { key: 'all', ar: 'الكل', en: 'All' },
  { key: 'restaurant', ar: 'مطاعم', en: 'Restaurants' },
  { key: 'cafe', ar: 'مقاهي وكافيهات', en: 'Cafés' },
  { key: 'supermarket', ar: 'سوبرماركت وبقالة', en: 'Supermarkets' },
  { key: 'shop', ar: 'محلات وتجارة عامة', en: 'Local Stores' },
  { key: 'bakery_sweets', ar: 'حلويات ومخابز', en: 'Bakeries & Sweets' },
  { key: 'butchery', ar: 'لحوم ودواجن', en: 'Butcheries' },
  { key: 'vegetables_fruits', ar: 'خضار وفواكه', en: 'Fruits & Vegetables' },
];

/**
 * Maps the Prisma `StoreType` enum to the local `StoreCategoryKey`.
 */
const STORE_TYPE_TO_CATEGORY: Record<StoreType, StoreCategoryKey> = {
  RESTAURANT: 'restaurant',
  CAFE: 'cafe',
  SUPERMARKET: 'supermarket',
  STORE: 'shop',
  BAKERY_SWEETS: 'bakery_sweets',
  BUTCHERY: 'butchery',
  VEGETABLES_FRUITS: 'vegetables_fruits',
};

/**
 * Keyword fallback for legacy stores without `storeType` set.
 * Arabic first — that is what the stores actually call themselves.
 * `shop` is the fallback and therefore carries no keywords.
 */
const CATEGORY_KEYWORDS: Record<Exclude<StoreCategoryKey, 'all' | 'shop'>, readonly string[]> = {
  restaurant: ['مطعم', 'مطاعم', 'شاورما', 'فلافل', 'مشاوي', 'بروست', 'برجر', 'restaurant', 'shawarma', 'grill', 'burger'],
  supermarket: ['سوبرماركت', 'ماركت', 'بقالة', 'تسوق', 'ميني', 'supermarket', 'market', 'grocery', 'mart'],
  cafe: ['مقهى', 'مقاهي', 'كافيه', 'قهوة', 'café', 'cafe', 'coffee'],
  bakery_sweets: ['حلويات', 'مخابز', 'حلوى', 'كيك', 'بسكويت', 'bakery', 'sweets', 'pastry', 'cake'],
  butchery: ['لحوم', 'دواجن', 'جزار', 'لحم', 'دجاج', 'meat', 'butchery', 'poultry', 'chicken'],
  vegetables_fruits: ['خضار', 'فواكه', 'خضراوات', 'فاكهة', 'فطير', 'vegetables', 'fruits', 'produce'],
};

/** Best-effort category for a store. Uses `storeType` when set, falls back to keywords. */
export function classifyStore(store: Pick<Store, 'nameAr' | 'nameEn'> & { storeType?: StoreType | null }): StoreCategoryKey {
  // Prefer the database column when available.
  if (store.storeType && store.storeType in STORE_TYPE_TO_CATEGORY) {
    return STORE_TYPE_TO_CATEGORY[store.storeType as keyof typeof STORE_TYPE_TO_CATEGORY];
  }
  // Keyword fallback for legacy stores without storeType.
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
  cafe: { gradient: 'from-warning-ink to-warning', tint: 'bg-warning-tint text-warning-ink' },
  supermarket: { gradient: 'from-brand-dark to-brand-soft', tint: 'bg-brand-tint text-brand-deep' },
  shop: { gradient: 'from-brand-deep to-brand', tint: 'bg-canvas text-ink-soft' },
  bakery_sweets: { gradient: 'from-amber-500 to-amber-100', tint: 'bg-warning-tint text-warning-ink' },
  butchery: { gradient: 'from-red-600 to-red-200', tint: 'bg-danger-tint text-danger-ink' },
  vegetables_fruits: { gradient: 'from-green-600 to-green-200', tint: 'bg-brand-tint text-brand-deep' },
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