import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { Product } from '@samou-go/shared-types';
import { ProductOptionsSheet } from './ProductOptionsSheet';
vi.mock('@samou-go/ui', () => ({ useLanguage: () => ({ t: (ar: string) => ar }) }));
function render(options: unknown) {
  const product: Product = { id: 'p', nameAr: 'Test product', price: 10, description: null, imageUrl: null, isAvailable: true, categoryId: null, storeId: 's' };
  Object.assign(product, { optionGroups: options });
  return renderToString(createElement(ProductOptionsSheet, { product, storeNameAr: 'Store', onClose: () => {}, onConfirm: () => {} }));
}
it('renders the modal without option groups', () => { expect(render(undefined)).toContain('Test product'); });
it('renders undefined groups and empty item arrays without crashing', () => {
  expect(render([undefined, { id: 'g', name: 'Empty', items: [] }, { id: 'g2', name: 'Missing' }])).toContain('Empty');
});
it('renders valid multiple-choice options', () => {
  const html = render([{ id: 'g', name: 'Extras', maxSelect: 2, items: [{ id: 'a', name: 'Cheese', priceDelta: 2, isActive: true }, { id: 'b', name: 'Sauce', priceDelta: 3, isActive: true }] }]);
  expect(html).toContain('Cheese'); expect(html).toContain('Sauce');
});
