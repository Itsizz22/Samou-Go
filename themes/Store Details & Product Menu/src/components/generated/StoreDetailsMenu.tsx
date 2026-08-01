import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, Plus, Star, Clock3, MapPin, Minus } from 'lucide-react';
import { HeaderNav } from './HeaderNav';
import { BottomTabs } from './BottomTabs';
type Product = {
  id: string;
  name: string;
  arabicName: string;
  price: string;
  image: string;
  category: string;
};
const categories = [{
  id: 'all',
  label: 'All',
  arabicLabel: 'الكل'
}, {
  id: 'dairy',
  label: 'Dairy',
  arabicLabel: 'ألبان'
}, {
  id: 'snacks',
  label: 'Snacks',
  arabicLabel: 'تسالي'
}, {
  id: 'drinks',
  label: 'Drinks',
  arabicLabel: 'مشروبات'
}];
const products: Product[] = [{
  id: 'milk',
  name: 'Fresh Full Cream Milk',
  arabicName: 'حليب كامل الدسم',
  price: '7.50',
  category: 'dairy',
  image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=420&q=85'
}, {
  id: 'labneh',
  name: 'Creamy Labneh',
  arabicName: 'لبنة كريمية',
  price: '12.00',
  category: 'dairy',
  image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=420&q=85'
}, {
  id: 'chips',
  name: 'Sea Salt Potato Chips',
  arabicName: 'رقائق بطاطا بالملح',
  price: '5.00',
  category: 'snacks',
  image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=420&q=85'
}, {
  id: 'juice',
  name: 'Orange Juice',
  arabicName: 'عصير برتقال طبيعي',
  price: '8.50',
  category: 'drinks',
  image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=420&q=85'
}];
export const StoreDetailsMenu = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [cartItems, setCartItems] = useState<Record<string, number>>({
    milk: 1,
    chips: 1
  });
  const visibleProducts = activeCategory === 'all' ? products : products.filter(product => product.category === activeCategory);
  const itemCount = Object.values(cartItems).reduce((total, count) => total + count, 0);
  const updateCart = (id: string, change: number) => {
    const previousCount = cartItems[id] || 0;
    setCartItems(current => {
      const nextCount = (current[id] || 0) + change;
      if (nextCount <= 0) {
        const next = {
          ...current
        };
        delete next[id];
        return next;
      }
      return {
        ...current,
        [id]: nextCount
      };
    });

    // Feedback the moment an item lands in the cart for the first time.
    if (change > 0 && previousCount === 0) {
      const product = products.find(p => p.id === id);
      if (product) {
        toast.success(`تمت إضافة ${product.arabicName} إلى السلة · ${product.name} added to cart`);
      }
    }
  };
  return <div dir="rtl" className="min-h-screen bg-canvas text-ink pb-36">
      <HeaderNav title="Store Details" arabicTitle="تفاصيل المتجر" showBack={true} showCart={true} cartCount={itemCount} />

      <main className="mx-auto w-full max-w-lg">
        <section aria-labelledby="store-heading" className="bg-surface pb-5">
          <figure className="relative h-48 w-full overflow-hidden sm:h-56">
            <img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1604719312566-8912e9c8a213?auto=format&fit=crop&w=900&q=90" alt="Shelves of fresh groceries inside Abu Khalil Market" />
            <figcaption className="absolute bottom-3 end-4 rounded-full bg-surface/95 px-3 py-1 text-xs font-semibold text-brand-deep shadow-card">Open now · مفتوح الآن</figcaption>
          </figure>
          <div className="px-5 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="store-heading" className="text-xl font-extrabold tracking-[-0.02em] text-ink">Abu Khalil Market</h2>
                <p className="mt-1 text-sm font-medium text-ink-muted">سوبرماركت أبو خليل</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-brand-surface px-3 py-1.5 text-sm font-bold text-brand-deep" aria-label="4.8 out of 5 stars">
                <Star className="h-4 w-4 fill-warning text-warning" />
                <span>4.8</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-ink-muted">
              <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-brand" />20–30 min · دقيقة</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-brand" />0.8 km · كم</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="categories-heading" className="px-5 pt-7">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-brand">Shop by aisle</p>
              <h2 id="categories-heading" className="text-lg font-extrabold text-ink">Categories <span className="font-medium text-ink-muted">/ الأقسام</span></h2>
            </div>
            <ChevronRight className="h-5 w-5 text-ink-subtle rtl:rotate-180" aria-hidden="true" />
          </div>
          <nav aria-label="Store categories" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-none">
            {categories.map(category => {
            const isActive = activeCategory === category.id;
            return <button key={category.id} type="button" onClick={() => setActiveCategory(category.id)} className={`min-w-[78px] rounded-xl border px-3 py-2.5 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 ${isActive ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-soft hover:border-brand'}`} aria-pressed={isActive}>
                  <span className="block text-xs font-bold">{category.label}</span>
                  <span className={`mt-0.5 block text-[11px] ${isActive ? 'text-white/85' : 'text-ink-muted'}`}>{category.arabicLabel}</span>
                </button>;
          })}
          </nav>
        </section>

        <section aria-labelledby="products-heading" className="px-5 pt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="products-heading" className="text-lg font-extrabold text-ink">Popular products <span className="font-medium text-ink-muted">/ الأكثر طلباً</span></h2>
            <span className="text-xs font-semibold text-ink-muted">{visibleProducts.length} items</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {visibleProducts.map(product => {
            const quantity = cartItems[product.id] || 0;
            return <article key={product.id} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                  <div className="h-32 bg-brand-surface p-3">
                    <img className="h-full w-full rounded-lg object-cover" src={product.image} alt={product.name} />
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-1 text-sm font-bold text-ink">{product.name}</h3>
                    <p className="mt-1 line-clamp-1 text-xs text-ink-muted">{product.arabicName}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-extrabold text-brand-deep"><span className="text-[11px] font-semibold">ILS</span> {product.price}</p>
                      {quantity > 0 ? <div className="flex items-center gap-2 rounded-lg bg-brand-surface px-1.5 py-1 text-brand-deep" aria-label={`${quantity} ${product.name} in cart`}>
                          <button type="button" onClick={() => updateCart(product.id, -1)} className="rounded-md p-0.5 hover:bg-surface" aria-label={`Remove one ${product.name}`}><Minus className="h-3.5 w-3.5" /></button>
                          <span className="min-w-3 text-center text-xs font-bold">{quantity}</span>
                          <button type="button" onClick={() => updateCart(product.id, 1)} className="rounded-md p-0.5 hover:bg-surface" aria-label={`Add one ${product.name}`}><Plus className="h-3.5 w-3.5" /></button>
                        </div> : <button type="button" onClick={() => updateCart(product.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white transition-transform hover:bg-brand-dark active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand/40" aria-label={`Add ${product.name} to cart`}><Plus className="h-4 w-4" /></button>}
                    </div>
                  </div>
                </article>;
          })}
          </div>
        </section>
      </main>

      {itemCount > 0 && <aside className="fixed bottom-[72px] start-4 end-4 z-40 mx-auto max-w-lg" aria-label="Shopping cart summary">
          <button type="button" className="flex w-full items-center justify-between rounded-xl bg-brand-deep px-4 py-3.5 text-white shadow-raised transition-colors hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2">
            <span className="flex flex-col items-start"><strong className="text-sm">View Cart ({itemCount} {itemCount === 1 ? 'item' : 'items'})</strong><span className="mt-0.5 text-xs text-white/75">عرض السلة</span></span>
            <span className="flex items-center gap-1 text-sm font-bold"><span>Go</span><ChevronRight className="h-4 w-4" /></span>
          </button>
        </aside>}
      <BottomTabs activeTab="home" />
    </div>;
};