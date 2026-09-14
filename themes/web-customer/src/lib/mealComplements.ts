import type { Product, StoreWithCatalogue } from '@samou-go/shared-types';

export function mealComplements(store: Pick<StoreWithCatalogue, 'id' | 'categories'>, excludedIds: ReadonlySet<string>): Product[] {
  const categories = /مشروبات|عصائر|drinks|beverages|juices/i;
  const names = /^(مياه|ماء|عصير|كولا|بيبسي|كوكا|سبرايت|فانتا|اكس ال|إكس ال|XL|water|juice|cola|coca|pepsi|sprite|fanta)(\s|$)/i;
  const seen = new Set<string>();
  const drinks = store.categories.flatMap(category => category.products.filter(product => {
    if (!product.isAvailable || product.storeId !== store.id || excludedIds.has(product.id) || seen.has(product.id)) return false;
    if (!categories.test(`${category.nameAr} ${category.nameEn ?? ''}`) && !names.test(product.nameAr)) return false;
    seen.add(product.id);
    return true;
  }));
  // Only suggest a drink alongside food, never for a drinks-only basket.
  const hasFood = store.categories.some(category => category.products.some(product =>
    product.storeId === store.id && excludedIds.has(product.id) &&
    !categories.test(`${category.nameAr} ${category.nameEn ?? ''}`) && !names.test(product.nameAr)
  ));
  return hasFood ? drinks.slice(0, 4) : [];
}
