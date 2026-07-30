import { useState } from 'react';
import { Bell, Check, ChevronLeft, Clock3, MapPin, Navigation, Package, Phone, UserRound, WalletCards, X } from 'lucide-react';
type Order = {
  id: string;
  store: string;
  storeEnglish: string;
  distance: string;
  fee: string;
  zone: string;
  zoneEnglish: string;
  items: string;
};
type CompletedDelivery = {
  id: string;
  store: string;
  customer: string;
  fee: string;
  time: string;
};
const availableOrders: Order[] = [{
  id: 'pharmacy',
  store: 'صيدلية السموع',
  storeEnglish: "Al-Samou' Pharmacy",
  distance: '1.2 km',
  fee: '3 ₪',
  zone: 'حي الوسط',
  zoneEnglish: 'Central District',
  items: '2 items · 2 أغراض'
}, {
  id: 'market',
  store: 'سوبرماركت أبو خليل',
  storeEnglish: 'Abu Khalil Market',
  distance: '2.4 km',
  fee: '5 ₪',
  zone: 'حي الجبل',
  zoneEnglish: 'Al Jabal District',
  items: '5 items · 5 أغراض'
}];
const completedDeliveries: CompletedDelivery[] = [{
  id: 'delivery-1',
  store: 'مطعم النور',
  customer: 'أحمد حسن · حي البلد',
  fee: '4 ₪',
  time: '11:42 ص'
}, {
  id: 'delivery-2',
  store: 'سوبرماركت السلطان',
  customer: 'ليان عوض · حي الوسط',
  fee: '3 ₪',
  time: '10:18 ص'
}, {
  id: 'delivery-3',
  store: 'مقهى الورد',
  customer: 'محمد خالد · حي الجبل',
  fee: '3 ₪',
  time: '09:05 ص'
}];
const navItems = [{
  id: 'home',
  label: 'الرئيسية',
  english: 'Home',
  icon: Navigation
}, {
  id: 'orders',
  label: 'الطلبات',
  english: 'Orders',
  icon: Package
}, {
  id: 'map',
  label: 'الخريطة',
  english: 'Map',
  icon: MapPin
}, {
  id: 'earnings',
  label: 'الأرباح',
  english: 'Earnings',
  icon: WalletCards
}, {
  id: 'account',
  label: 'حسابي',
  english: 'Account',
  icon: UserRound
}];
export function SamouGoCaptain() {
  const [available, setAvailable] = useState(true);
  const [activeDelivery, setActiveDelivery] = useState(true);
  const [acceptedOrders, setAcceptedOrders] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('home');
  return <main dir="rtl" className="min-h-screen bg-canvas pb-24 font-sans text-ink">
      <header className="bg-brand px-4 pb-4 pt-3 text-white">
        <nav className="mx-auto flex max-w-md items-center justify-between" aria-label="Captain navigation">
          <button type="button" aria-label="Profile" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-surface/15 transition hover:bg-surface/25"><UserRound size={21} /></button>
          <div className="text-center leading-tight">
            <p className="text-[16px] font-extrabold">مرحباً عمر 👋</p>
            <p dir="ltr" className="text-[11px] font-medium text-white/85">Hello, Omar</p>
          </div>
          <div className="flex items-center gap-2" dir="ltr">
            <button type="button" aria-label="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-surface/15"><Bell size={20} /><span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full border border-brand bg-warning" /></button>
            <button type="button" aria-pressed={available} onClick={() => setAvailable(!available)} className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-bold transition ${available ? 'bg-surface text-brand-dark' : 'bg-black/20 text-white'}`}>
              <span className={`h-2 w-2 rounded-full ${available ? 'bg-brand' : 'bg-surface/70'}`} />
              <span dir="rtl">{available ? 'متاح' : 'غير متاح'}</span><span dir="ltr">/ {available ? 'Available' : 'Offline'}</span>
            </button>
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-md px-4">
        <section aria-labelledby="earnings-title" className="-mt-1 rounded-b-[24px] bg-gradient-to-br from-brand-dark via-brand to-brand px-5 pb-5 pt-4 text-white shadow-raised">
          <div className="flex items-start justify-between">
            <div><p className="text-[12px] font-semibold text-white/85">أرباح اليوم</p><p dir="ltr" className="text-[11px] text-white/80">Today's Earnings</p></div>
            <WalletCards size={21} className="text-white/80" />
          </div>
          <p id="earnings-title" dir="ltr" className="mt-1 text-[32px] font-black tracking-tight">35 ₪</p>
          <div className="mt-1 flex items-center gap-5 text-[11px] font-semibold text-white/85"><span>8 توصيلات <b dir="ltr" className="font-normal">/ 8 Deliveries</b></span><span>3.5 ساعة <b dir="ltr" className="font-normal">/ 3.5 hrs</b></span></div>
          <div className="mt-4 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface/25"><div className="h-full w-[70%] rounded-full bg-surface" /></div><span dir="ltr" className="text-[10px] text-white/85">70% of target</span></div>
        </section>

        {activeDelivery && <section aria-labelledby="active-delivery-title" className="mt-5 rounded-2xl border border-warning-tint bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between"><span className="rounded-full bg-warning-tint px-2.5 py-1 text-[10px] font-extrabold text-warning-ink">التوصيل الحالي <span dir="ltr" className="font-semibold">/ Active Delivery</span></span><span className="text-[11px] font-bold text-ink-muted">الآن · Now</span></div>
          <div className="mt-3 flex items-start justify-between"><div><h2 id="active-delivery-title" className="text-[15px] font-extrabold">صيدلية السموع</h2><p dir="ltr" className="text-[11px] text-ink-muted">Al-Samou' Pharmacy</p><p className="mt-2 text-[12px] font-semibold">سارة محمود <span className="mx-1 text-line">·</span> شارع الرئيسي</p></div><div className="text-start"><p dir="ltr" className="text-lg font-black text-brand-dark">3 ₪</p><p className="text-[10px] text-ink-muted">delivery fee</p></div></div>
          <div className="mt-4 flex items-center gap-2" aria-label="Delivery status"><div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-dark"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-tint"><Check size={12} /></span><span dir="ltr">Picked Up</span></div><div className="h-px flex-1 bg-brand-tint" /><div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-dark"><span className="h-2 w-2 rounded-full bg-brand ring-4 ring-brand-tint" /><span dir="ltr">On the Way</span></div><div className="h-px w-8 bg-line" /><div className="text-[10px] text-ink-subtle" dir="ltr">Delivered</div></div>
          <div className="mt-4 flex gap-2"><button type="button" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-[11px] font-bold text-ink-soft transition hover:bg-brand-surface"><Phone size={14} /> <span>اتصل بالزبون</span></button><button type="button" onClick={() => setActiveDelivery(false)} className="flex flex-[1.35] items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-[11px] font-bold text-white transition hover:bg-brand-dark"><Check size={14} /> <span>تم التوصيل / Delivered</span></button></div>
        </section>}

        <section aria-labelledby="orders-title" className="mt-6">
          <div className="mb-3 flex items-end justify-between"><div><h2 id="orders-title" className="text-[17px] font-extrabold">طلبات متاحة <span className="me-1 text-brand">{availableOrders.length - acceptedOrders.length}</span></h2><p dir="ltr" className="text-[11px] text-ink-muted">Available Orders</p></div><button type="button" aria-label="See all orders" className="flex items-center gap-1 text-[11px] font-bold text-brand">عرض الكل <ChevronLeft size={14} /></button></div>
          <div className="space-y-3">
            {availableOrders.map(order => !acceptedOrders.includes(order.id) && <article key={order.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card"><div className="flex items-start justify-between"><div><h3 className="text-[14px] font-extrabold">{order.store}</h3><p dir="ltr" className="text-[10px] text-ink-muted">{order.storeEnglish} <span className="mx-1">·</span> {order.distance}</p></div><span dir="ltr" className="rounded-lg bg-brand-tint px-2.5 py-1 text-[12px] font-black text-brand-dark">{order.fee}</span></div><div className="mt-3 flex items-center justify-between text-[11px] text-ink-muted"><span className="font-semibold">{order.zone} <b dir="ltr" className="font-normal text-ink-subtle">/ {order.zoneEnglish}</b></span><span>{order.items}</span></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => setAcceptedOrders([...acceptedOrders, order.id])} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2 text-[11px] font-extrabold text-white transition hover:bg-brand-dark"><Check size={14} /> <span>قبول / Accept</span></button><button type="button" onClick={() => setAcceptedOrders([...acceptedOrders, order.id])} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-[11px] font-bold text-ink-muted transition hover:bg-brand-surface"><X size={14} /> <span>تجاهل / Ignore</span></button></div></article>)}
            {acceptedOrders.length === availableOrders.length && <p className="rounded-2xl bg-surface p-5 text-center text-[12px] text-ink-muted">لا توجد طلبات جديدة <span dir="ltr">/ No new orders</span></p>}
          </div>
        </section>

        <section aria-labelledby="today-title" className="mt-6"><div className="mb-3"><h2 id="today-title" className="text-[17px] font-extrabold">توصيلات اليوم</h2><p dir="ltr" className="text-[11px] text-ink-muted">Today's Deliveries</p></div><div className="overflow-hidden rounded-2xl bg-surface shadow-card">{completedDeliveries.map(delivery => <div key={delivery.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand"><Check size={16} strokeWidth={3} /></span><div className="min-w-0 flex-1"><h3 className="truncate text-[12px] font-extrabold">{delivery.store}</h3><p className="truncate text-[10px] text-ink-muted">{delivery.customer}</p></div><div className="text-start"><p dir="ltr" className="text-[12px] font-extrabold text-brand-dark">{delivery.fee}</p><p className="flex items-center gap-1 text-[10px] text-ink-subtle"><Clock3 size={11} /> {delivery.time}</p></div></div>)}</div></section>
      </div>

      <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-line bg-surface/95 px-2 pb-[max(9px,env(safe-area-inset-bottom))] pt-2 shadow-raised backdrop-blur" aria-label="Bottom navigation"><div className="mx-auto flex max-w-md items-center justify-around" dir="rtl">{navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return <button key={item.id} type="button" onClick={() => setActiveTab(item.id)} className={`flex min-w-[52px] flex-col items-center gap-0.5 rounded-xl px-2 py-1 transition ${isActive ? 'text-brand' : 'text-ink-subtle hover:text-ink-soft'}`} aria-current={isActive ? 'page' : undefined}><Icon size={19} strokeWidth={isActive ? 2.7 : 1.8} /><span className="text-[10px] font-bold">{item.label}</span><span dir="ltr" className="text-[8px] font-normal">{item.english}</span></button>;
        })}</div></nav>
    </main>;
}