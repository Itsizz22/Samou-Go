import { LanguageProvider } from '@samou-go/ui';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CartProvider, useCart } from '../src/components/CartProvider';
import { CravingShortcuts } from '../src/components/CravingShortcuts';
import { MealComplements } from '../src/components/MealComplements';
import '../src/index.css';
function Fixture() {
  const cart = useCart();
  return <main className="mx-auto max-w-md bg-canvas p-5 text-ink">
    <CravingShortcuts products={cart.lines.map(line => line.product)} />
    <output aria-label="cart-count">{cart.itemCount}</output>
    {cart.storeGroups.map(group => <MealComplements key={group.storeId} group={group} />)}
  </main>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><BrowserRouter><CartProvider><Fixture /></CartProvider></BrowserRouter></LanguageProvider>);
