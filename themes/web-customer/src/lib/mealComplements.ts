import type { Product, StoreWithCatalogue } from '@samou-go/shared-types';

export function mealComplements(store: StoreWithCatalogue, excludedIds: ReadonlySet<string>): Product[] {
  const categories = /مشروبات|مقبلات|سلطات|drinks|beverages|appetizers|salads|sides/i;
  const names = /^(مياه|ماء|عصير|سلطة|بطاطا|بطاطس|حمص|متبل|بيبسي|كوكا|سبرايت|فانتا|water|juice|salad|fries|pepsi|sprite|fanta|hummus)(\s|$)/i;
  const seen = new Set<string>();
  return store.categories.flatMap(category => category.products.filter(product => {
    if (!product.isAvailable || product.storeId !== store.id || excludedIds.has(product.id) || seen.has(product.id)) return false;
    if (!categories.test(`${category.nameAr} ${category.nameEn ?? ''}`) && !names.test(product.nameAr)) return false;
    seen.add(product.id);
    return true;
  })).slice(0, 3);
}
