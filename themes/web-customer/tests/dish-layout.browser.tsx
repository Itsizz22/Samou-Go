import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LanguageProvider } from '@samou-go/ui';
import { getNewProducts, useResource } from '../src/hooks/useApi';
import { DiscoverySections } from '../src/components/DiscoverySections';
import { FeaturedProductsShowcase } from '../src/components/FeaturedProductsShowcase';
import '../src/index.css';
function Fixture() {
  const [added, setAdded] = useState('');
  const products = useResource('dish-layout-fixture', signal => getNewProducts(24, signal, true));
  return <main className="mx-auto max-w-md bg-canvas pb-8 text-ink"><output aria-label="added-product">{added}</output><FeaturedProductsShowcase products={(products.data ?? []).slice(0, 2)} loading={products.loading} onAdd={p => setAdded(p.id)} /><DiscoverySections onAdd={p => setAdded(p.id)} /></main>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><BrowserRouter><Fixture /></BrowserRouter></LanguageProvider>);
