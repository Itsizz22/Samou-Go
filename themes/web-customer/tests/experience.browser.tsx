import React, { useState } from 'react';
import { useCheckoutDraft } from '../src/hooks/useCheckoutDraft';
import { createRoot } from 'react-dom/client';
import {
  setToken,
  OrderChangePanel,
  SupportDesk,
  PreparationCountdown,
} from '@samou-go/api-client';
import { CartProvider, useCart, cartLineKey } from '../src/components/CartProvider';
import { NotificationPreferences } from '../src/components/NotificationPreferences';
import { OrderRatingForm } from '../src/components/OrderRatingForm';
import type { Product } from '@samou-go/shared-types';
import '../src/index.css';
setToken('qa-fixture-token');
const product: Product = {
  id: 'p',
  nameAr: 'بيتزا الجبنة',
  price: 30,
  imageUrl: null,
  description: null,
  isAvailable: true,
  storeId: 's',
  categoryId: null,
};
const proposal = {
  input: [],
  lines: [
    {
      productId: 'p',
      quantity: 1,
      unitPrice: 35,
      selectedOptions: [{ id: 'cheese', groupId: 'g', name: 'جبنة إضافية', priceDelta: 5 }],
    },
  ],
  subtotal: 35,
  netSubtotal: 35,
  discount: 0,
  totalAmount: 35,
  autoPriced: false,
};
const order = {
  id: 'qa',
  storeId: 's',
  status: 'PENDING',
  updatedAt: '2026-09-09T20:00:00.000Z',
  unavailableAction: 'SUGGEST',
  items: [{ productId: 'p', product }],
  changeProposal: JSON.stringify(proposal),
};
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = String(input);
  const ok = (data: unknown) => Response.json({ success: true, data });
  if (url.includes('/auth/me/notifications'))
    return ok({
      marketingNotificationsEnabled:
        init?.method === 'PATCH'
          ? JSON.parse(String(init.body)).marketingNotificationsEnabled
          : true,
    });
  if (url.includes('/orders/qa/change-decision')) {
    order.changeProposal = '';
    return ok(order);
  }
  if (url.includes('/orders/qa/rating')) return ok({});
  if (url.endsWith('/orders/qa')) return ok(order);
  if (url.endsWith('/stores/s')) return ok({ categories: [{ products: [product] }] });
  if (url.includes('/support/tickets')) return ok({ items: [], total: 0, page: 1, totalPages: 0 });
  return nativeFetch(input, init);
};
function CartProbe() {
  const cart = useCart();
  return (
    <section className="rounded-2xl border border-line p-4">
      <h2 className="font-bold">فحص نسختين بإضافات مختلفة</h2>
      <button
        className="min-h-11 text-brand"
        onClick={() => {
          cart.clear();
          cart.addItem(product, 1, '', 'مطعم');
          cart.addItem(product, 1, '', 'مطعم', [
            { id: 'cheese', groupId: 'g', name: 'جبنة', priceDelta: 5 },
          ]);
        }}
      >
        أضف النسختين
      </button>
      <output data-testid="cart">
        {cart.lines.length} / {cart.subtotal}
      </output>
      {cart.lines.map(line => (
        <button
          key={cartLineKey(line)}
          className="block min-h-11"
          onClick={() => cart.removeItem(cartLineKey(line))}
        >
          {line.selectedOptions?.length ? 'حذف بالجبنة' : 'حذف العادية'}
        </button>
      ))}
    </section>
  );
}
function DraftProbe() {
  const [account, setAccount] = useState('first');
  const [draft, setDraft] = useCheckoutDraft(`qa-checkout-draft:${account}`);
  return <section>
    <input aria-label="Checkout draft" value={draft} onChange={event => setDraft(event.target.value)} />
    <button onClick={() => setAccount(account === 'first' ? 'second' : 'first')}>Switch draft account</button>
  </section>;
}
function Preview() {
  const [show, setShow] = useState(false);
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-xl font-bold">تجربة الطلب المحسّنة</h1>
      <CartProbe />
      <DraftProbe />
      <OrderChangePanel orderId="qa" />
      <PreparationCountdown
        customer
        order={{
          id: 'qa',
          status: 'PREPARING',
          captainId: null,
          estimatedReadyAt: new Date(Date.now() + 300000).toISOString(),
        }}
      />
      <NotificationPreferences />
      <OrderRatingForm orderId="qa" hasCaptain />
      <button className="min-h-11 text-brand" onClick={() => setShow(!show)}>
        فحص الدعم المرتبط
      </button>
      {show && <SupportDesk userId="qa" orderId="qa" />}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <CartProvider>
    <Preview />
  </CartProvider>
);
