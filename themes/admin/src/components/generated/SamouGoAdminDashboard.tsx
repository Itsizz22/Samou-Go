import { useState } from 'react';
import { BarChart3, Bell, ChevronDown, CircleDollarSign, ClipboardList, LayoutDashboard, Menu, Package, Search, Settings, ShoppingBag, Store, Truck, UserCheck, Users, WalletCards, X } from 'lucide-react';
import { tokens } from '@/theme/tokens';
const navItems = [{
  label: 'Dashboard',
  arabic: 'لوحة التحكم',
  icon: LayoutDashboard
}, {
  label: 'Users',
  arabic: 'المستخدمون',
  icon: Users
}, {
  label: 'Stores',
  arabic: 'المتاجر',
  icon: Store
}, {
  label: 'Captains',
  arabic: 'السائقون',
  icon: Truck
}, {
  label: 'Orders',
  arabic: 'الطلبات',
  icon: Package
}, {
  label: 'Finance',
  arabic: 'المالية',
  icon: WalletCards
}, {
  label: 'Reports',
  arabic: 'التقارير',
  icon: BarChart3
}, {
  label: 'Settings',
  arabic: 'الإعدادات',
  icon: Settings
}];
const kpis = [{
  label: 'Total Orders Today',
  arabic: 'إجمالي الطلبات اليوم',
  value: '142',
  unit: 'طلب',
  trend: '+12.5%',
  icon: ClipboardList
}, {
  label: 'Active Deliveries',
  arabic: 'توصيل نشط',
  value: '8',
  unit: 'توصيل',
  trend: '+4.2%',
  icon: Truck
}, {
  label: 'Registered Stores',
  arabic: 'المتاجر المسجلة',
  value: '24',
  unit: 'متجر',
  trend: '+8.1%',
  icon: Store
}, {
  label: 'Revenue Today',
  arabic: 'الإيرادات اليوم',
  value: '890',
  unit: 'ILS',
  trend: '+16.8%',
  icon: CircleDollarSign
}];
const orders = [{
  id: '#SG-1042',
  customer: 'Ahmad Khalil',
  customerAr: 'أحمد خليل',
  store: 'Al-Nour Restaurant',
  captain: 'Omar H.',
  status: 'Delivered',
  statusAr: 'تم التوصيل',
  amount: '₪42.00',
  tone: 'green'
}, {
  id: '#SG-1041',
  customer: 'Lina Samara',
  customerAr: 'لينا سمارة',
  store: 'Abu Khalil Market',
  captain: 'Yazan M.',
  status: 'On the Way',
  statusAr: 'في الطريق',
  amount: '₪86.50',
  tone: 'orange'
}, {
  id: '#SG-1040',
  customer: 'Sami Al-Tamimi',
  customerAr: 'سامي التميمي',
  store: 'Al-Samou Pharmacy',
  captain: '—',
  status: 'Preparing',
  statusAr: 'قيد التحضير',
  amount: '₪27.00',
  tone: 'blue'
}, {
  id: '#SG-1039',
  customer: 'Maya Darwish',
  customerAr: 'مايا درويش',
  store: 'Sultan Market',
  captain: 'Hani A.',
  status: 'Pending',
  statusAr: 'معلق',
  amount: '₪63.00',
  tone: 'yellow'
}, {
  id: '#SG-1038',
  customer: 'Fadi Nassar',
  customerAr: 'فادي نصار',
  store: 'Rose Café',
  captain: 'Omar H.',
  status: 'Delivered',
  statusAr: 'تم التوصيل',
  amount: '₪31.50',
  tone: 'green'
}];
const activities = [{
  title: 'New store registered',
  arabic: 'تم تسجيل متجر جديد',
  detail: 'Sultan Market · متجر السلطان',
  time: '12 min ago',
  color: 'bg-brand-tint text-brand-dark',
  icon: Store
}, {
  title: 'Captain approved',
  arabic: 'تمت الموافقة على سائق',
  detail: 'Yazan Mahmoud · يزن محمود',
  time: '28 min ago',
  color: 'bg-info-tint text-info-ink',
  icon: UserCheck
}, {
  title: 'Order flagged',
  arabic: 'تم وضع علامة على طلب',
  detail: '#SG-1035 · يحتاج مراجعة',
  time: '43 min ago',
  color: 'bg-warning-tint text-warning-ink',
  icon: ClipboardList
}, {
  title: 'Payment received',
  arabic: 'تم استلام دفعة',
  detail: 'Order #SG-1032 · ₪58.00',
  time: '1 hr ago',
  color: 'bg-brand-tint text-brand-deep',
  icon: CircleDollarSign
}];
const weeklyOrders = [{
  day: 'Sat',
  arabic: 'السبت',
  value: 58
}, {
  day: 'Sun',
  arabic: 'الأحد',
  value: 76
}, {
  day: 'Mon',
  arabic: 'الإثنين',
  value: 64
}, {
  day: 'Tue',
  arabic: 'الثلاثاء',
  value: 91
}, {
  day: 'Wed',
  arabic: 'الأربعاء',
  value: 83
}, {
  day: 'Thu',
  arabic: 'الخميس',
  value: 112
}, {
  day: 'Fri',
  arabic: 'الجمعة',
  value: 142
}];
export function SamouGoAdminDashboard() {
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return <main dir="rtl" className="min-h-screen bg-canvas font-sans text-ink">
      <aside className={`fixed inset-y-0 start-0 z-30 flex w-[244px] flex-col bg-brand-deep px-4 py-6 text-white transition-transform duration-200 lg:translate-x-0! ${sidebarOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'}`} aria-label="Admin sidebar">
        <div className="flex items-center gap-3 px-3 pb-9" dir="ltr">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-brand"><ShoppingBag size={22} strokeWidth={2.6} /></span>
          <span><strong className="block text-[18px] tracking-[-0.03em]">Samou' Go</strong><span className="block text-[10px] font-medium text-white/70">السموع جو · ADMIN</span></span>
          <button type="button" className="ms-auto rounded-lg p-1 text-white/80 hover:bg-surface/10 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X size={18} /></button>
        </div>
        <nav className="flex-1" aria-label="Primary navigation">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Workspace</p>
          <ul className="space-y-1">
            {navItems.map(item => {
            const Icon = item.icon;
            const active = activeNav === item.label;
            return <li key={item.label}><button type="button" onClick={() => {
                setActiveNav(item.label);
                setSidebarOpen(false);
              }} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition ${active ? 'bg-brand text-white shadow-raised' : 'text-white/75 hover:bg-surface/10 hover:text-white'}`}><Icon size={18} strokeWidth={active ? 2.5 : 2} /><span className="flex-1 text-[13px] font-semibold">{item.label}</span><span dir="rtl" className={`text-[12px] ${active ? 'text-white/85' : 'text-white/65'}`}>{item.arabic}</span></button></li>;
          })}
          </ul>
        </nav>
        <div className="border-t border-white/10 pt-5"><div className="flex items-center gap-3 rounded-xl px-2 py-2"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-sm font-extrabold text-brand-deep">MA</span><span className="min-w-0"><strong className="block truncate text-[12px]">Admin</strong><span className="block truncate text-[11px] text-white/70">مدير النظام</span></span><ChevronDown size={15} className="ms-auto text-white/70" /></div></div>
      </aside>

      <section className="min-h-screen lg:ps-[244px]">
        <header className="sticky top-0 z-20 flex min-h-[78px] items-center justify-between border-b border-line bg-surface/95 px-5 shadow-card backdrop-blur md:px-8">
          <div className="flex items-center gap-3"><button type="button" className="rounded-lg p-2 text-brand-deep hover:bg-brand-surface lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu size={21} /></button><div><h1 className="text-[18px] font-extrabold tracking-[-0.02em] md:text-[21px]">Dashboard <span className="font-semibold text-ink-muted">/ لوحة التحكم</span></h1><p className="mt-1 text-[11px] text-ink-muted">Friday, 08 March 2024 <span className="mx-1 text-line">·</span> الجمعة، ٨ مارس ٢٠٢٤</p></div></div>
          <div className="flex items-center gap-3 md:gap-5"><label className="hidden h-10 w-[205px] items-center gap-2 rounded-xl border border-line bg-canvas px-3 text-ink-muted md:flex"><Search size={17} /><input className="w-full bg-transparent text-xs outline-none placeholder:text-ink-subtle" placeholder="Search / بحث..." aria-label="Search dashboard" /></label><button type="button" className="relative rounded-xl p-2.5 text-ink-soft hover:bg-brand-surface" aria-label="Notifications"><Bell size={19} /><span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-danger" /></button><span className="hidden h-8 w-px bg-line md:block" /><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tint text-xs font-extrabold text-brand-dark">MA</span><span className="hidden text-end md:block"><strong className="block text-xs">Admin</strong><span dir="rtl" className="block text-[10px] text-ink-muted">مدير النظام</span></span><ChevronDown size={14} className="hidden text-ink-muted md:block" /></div></div>
        </header>

        <div className="mx-auto max-w-[1500px] px-5 py-7 md:px-8 md:py-9">
          <section aria-labelledby="overview-title"><div className="mb-5 flex items-end justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand">Overview</p><h2 id="overview-title" className="mt-1 text-[20px] font-extrabold tracking-[-0.025em]">Good morning, Admin <span aria-hidden="true">👋</span></h2></div><button type="button" className="hidden rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-brand-deep shadow-card hover:border-brand sm:block">Export report <span className="ms-1 text-ink-muted">تصدير التقرير</span></button></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map(kpi => {
              const Icon = kpi.icon;
              return <article key={kpi.label} className="rounded-xl border border-line bg-surface p-5 shadow-card"><div className="flex items-start justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon size={20} /></span><span className="flex items-center gap-1 rounded-full bg-brand-surface px-2 py-1 text-[10px] font-bold text-brand">↗ {kpi.trend}</span></div><p className="mt-5 text-[28px] font-extrabold leading-none tracking-[-0.04em] text-ink">{kpi.value} <span className="text-sm font-bold tracking-normal text-ink-muted">{kpi.unit}</span></p><p className="mt-2 text-xs font-semibold text-ink-soft">{kpi.label}</p><p dir="rtl" className="mt-0.5 text-[11px] text-ink-subtle">{kpi.arabic}</p></article>;
            })}
            </div>
          </section>

          <section className="mt-7 grid gap-5 xl:grid-cols-[1.55fr_1fr]" aria-label="Orders and activity">
            <article className="overflow-hidden rounded-xl border border-line bg-surface shadow-card"><div className="flex items-center justify-between border-b border-line-soft px-5 py-5"><div><h2 className="text-[15px] font-extrabold">Live Orders</h2><p className="mt-1 text-[11px] text-ink-muted">الطلبات المباشرة · Updated just now</p></div><button type="button" className="text-xs font-bold text-brand hover:text-brand-dark">View all <span dir="rtl" className="font-normal text-ink-subtle">عرض الكل</span></button></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-start"><thead className="bg-canvas text-[10px] font-bold uppercase tracking-[0.06em] text-ink-muted"><tr><th className="px-5 py-3">Order ID</th><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Store</th><th className="px-3 py-3">Captain</th><th className="px-3 py-3">Status</th><th className="px-5 py-3 text-end">Amount</th></tr></thead><tbody className="divide-y divide-line-soft">{orders.map(order => <tr key={order.id} className="text-xs hover:bg-canvas"><td className="px-5 py-4 font-bold text-brand-deep">{order.id}</td><td className="px-3 py-4"><span className="block font-semibold text-brand-deep">{order.customer}</span><span dir="rtl" className="block text-[10px] text-ink-subtle">{order.customerAr}</span></td><td className="px-3 py-4 whitespace-nowrap text-ink-muted">{order.store}</td><td className="px-3 py-4 whitespace-nowrap text-ink-muted">{order.captain}</td><td className="px-3 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${order.tone === 'green' ? 'bg-brand-tint text-brand-dark' : order.tone === 'orange' ? 'bg-warning-tint text-warning-ink' : order.tone === 'blue' ? 'bg-info-tint text-info-ink' : 'bg-warning-tint text-warning-ink'}`}>{order.status}<span dir="rtl" className="ms-1 font-medium opacity-75">· {order.statusAr}</span></span></td><td className="px-5 py-4 text-end font-extrabold text-brand-deep">{order.amount}</td></tr>)}</tbody></table></div></article>
            <article className="rounded-xl border border-line bg-surface p-5 shadow-card"><div className="flex items-start justify-between"><div><h2 className="text-[15px] font-extrabold">Recent Activity</h2><p className="mt-1 text-[11px] text-ink-muted">آخر النشاطات · System events</p></div><button type="button" aria-label="Activity options" className="rounded-lg p-1.5 text-ink-muted hover:bg-brand-surface"><ChevronDown size={17} /></button></div><ul className="mt-5 divide-y divide-line-soft">{activities.map(activity => {
                const Icon = activity.icon;
                return <li key={activity.title} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activity.color}`}><Icon size={16} /></span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-brand-deep">{activity.title}</p><p dir="rtl" className="mt-0.5 truncate text-[10px] text-ink-muted">{activity.arabic}</p><p className="mt-1 truncate text-[10px] text-ink-subtle">{activity.detail}</p></div><time className="shrink-0 text-[10px] text-ink-subtle">{activity.time}</time></li>;
              })}</ul></article>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]" aria-label="Weekly analytics">
            <article className="rounded-xl border border-line bg-surface p-5 shadow-card"><div className="flex items-start justify-between"><div><h2 className="text-[15px] font-extrabold">Daily Orders</h2><p className="mt-1 text-[11px] text-ink-muted">الطلبات اليومية · This week</p></div><button type="button" className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold text-ink-muted">This week <ChevronDown size={13} /></button></div><div className="mt-7 flex h-[180px] items-end justify-between gap-3 border-b border-line px-2 pb-0">{weeklyOrders.map(item => <div key={item.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-bold text-ink-muted">{item.value}</span><span className={`w-full max-w-[40px] rounded-t-md transition hover:bg-brand-dark ${item.day === 'Fri' ? 'bg-brand' : 'bg-brand-soft'}`} style={{
                  height: `${item.value / 142 * 118}px`
                }} title={`${item.value} orders`} /><span className="pb-3 text-[10px] text-ink-muted">{item.day}</span></div>)}</div><div className="mt-3 flex justify-between px-2 text-[9px] text-ink-subtle">{weeklyOrders.map(item => <span key={item.arabic}>{item.arabic}</span>)}</div></article>
            <article className="rounded-xl border border-line bg-surface p-5 shadow-card"><div><h2 className="text-[15px] font-extrabold">Orders by Category</h2><p className="mt-1 text-[11px] text-ink-muted">الطلبات حسب الفئة · Today</p></div><div className="mt-6 flex items-center justify-center gap-8 sm:gap-12"><div className="relative flex h-[145px] w-[145px] items-center justify-center rounded-full" style={{
                background: `conic-gradient(${tokens.brand} 0 54%, ${tokens.brandSoft} 54% 78%, ${tokens.brandTint} 78% 100%)`
              }}><span className="flex h-[82px] w-[82px] flex-col items-center justify-center rounded-full bg-surface"><strong className="text-xl font-extrabold text-brand-deep">142</strong><span className="text-[10px] text-ink-muted">orders</span></span></div><ul className="space-y-4 text-[11px]"><li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-brand" /><span className="text-ink-soft">Restaurants</span><strong className="ms-2 text-brand-deep">54%</strong></li><li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-brand-soft" /><span className="text-ink-soft">Pharmacy</span><strong className="ms-2 text-brand-deep">24%</strong></li><li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-brand-tint" /><span className="text-ink-soft">Supermarket</span><strong className="ms-2 text-brand-deep">22%</strong></li></ul></div></article>
          </section>
        </div>
      </section>
    </main>;
}