import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { OrderAmounts } from '@samou-go/api-client';
const order = { subtotal: 30, discount: 5, deliveryFee: 7, totalAmount: 32 };
it('shows the store net products value without delivery charges', () => {
  const html = renderToStaticMarkup(createElement(OrderAmounts, { order, store: true }));
  expect(html).toContain('25.00'); expect(html).toContain('30.00'); expect(html).toContain('5.00');
  expect(html).not.toContain('رسوم التوصيل'); expect(html).not.toContain('32.00');
});
it('shows captain and customer both delivery charges and full total', () => {
  const html = renderToStaticMarkup(createElement(OrderAmounts, { order }));
  expect(html).toContain('رسوم التوصيل'); expect(html).toContain('7.00'); expect(html).toContain('32.00');
});
