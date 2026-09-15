import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { OrderStatus } from '@samou-go/shared-types';
import { OrderStatusTimeline } from './OrderStatusTimeline';
vi.mock('@samou-go/ui', () => ({ useLanguage: () => ({ language: 'ar' }), cn: (...args: unknown[]) => args.filter(a => typeof a === 'string').join(' ') }));
it('shows collection stages without delivery for pickup', () => {
  const html = renderToString(createElement(OrderStatusTimeline, { status: OrderStatus.READY_FOR_PICKUP, pickup: true }));
  expect(html).toContain('تم الاستلام');
  expect(html).not.toContain('تم التوصيل');
  expect(html).not.toContain('في الطريق');
});
it('keeps delivery stages for delivery orders', () => {
  const html = renderToString(createElement(OrderStatusTimeline, { status: OrderStatus.ON_THE_WAY }));
  expect(html).toContain('في الطريق');
  expect(html).toContain('تم التوصيل');
});
