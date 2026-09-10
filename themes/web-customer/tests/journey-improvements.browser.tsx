import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '@samou-go/ui';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useStore, useOrders, setToken } from '@samou-go/api-client';
import { CartProvider, useCart } from '../src/components/CartProvider';
import { CartAddedNotice } from '../src/components/CartAddedNotice';
import { ActiveOrderStrip } from '../src/components/ActiveOrderStrip';
import { DeliveryEstimate, CheckoutDeliveryEstimate } from '../src/components/DeliveryEstimate';
import '../src/index.css';
setToken('fixture-only');
function Fixture() {
  const cart = useCart();
  const { data: store } = useStore('qa-store');
  const orders = useOrders({ activeOnly: true });
  const product = store?.categories[0]?.products[0];
  return <main className="mx-auto max-w-md p-5"><ActiveOrderStrip orders={orders.data?.items ?? []} />{store && <DeliveryEstimate store={store} />}<CheckoutDeliveryEstimate storeId="qa-store" pickup={true} />{product && <button className="btn-primary" onClick={() => cart.addItem(product)}>إضافة المنتج</button>}</main>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><BrowserRouter><CartProvider><CartAddedNotice /><Routes><Route path="/cart" element={<h1>سلة المشتريات</h1>} /><Route path="/orders/:id" element={<h1>تفاصيل الطلب الصحيح</h1>} /><Route path="*" element={<Fixture />} /></Routes></CartProvider></BrowserRouter></LanguageProvider>);
