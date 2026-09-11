import { CategoryImagesSettings } from './CategoryImagesSettings';
import { Image, LayoutGrid, ExternalLink } from 'lucide-react';
import { FeaturedProductsSettings } from './FeaturedProductsSettings';
import { BannerSettings } from './BannerSettings';

/** Dedicated content workspace; editor state stays mounted while navigating sections. */
export function AppAppearancePanel() {
  return <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2"><h2 className="text-xl font-bold">إدارة واجهة التطبيق</h2><p className="max-w-2xl text-sm leading-7 text-ink-muted">نظّم أقسام الطعام والأطباق المميزة، وأضف صور الإعلانات ورتّب البانرات التي تظهر للزبون. لكل محرر زر حفظ مستقل.</p></div>
        <a href="https://samou-go-customer.vercel.app" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-bold text-brand focus-visible:ring-2 focus-visible:ring-brand">معاينة التطبيق<ExternalLink size={16} aria-hidden="true" /></a>
      </div>
      <nav aria-label="أدوات إدارة واجهة التطبيق" className="flex flex-wrap gap-2">
        <a href="#appearance-dishes" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-tint px-4 text-sm font-bold text-brand-deep focus-visible:ring-2 focus-visible:ring-brand"><LayoutGrid size={18} aria-hidden="true" />الأقسام والأطباق</a>
        <a href="#appearance-banners" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-tint px-4 text-sm font-bold text-brand-deep focus-visible:ring-2 focus-visible:ring-brand"><Image size={18} aria-hidden="true" />الصور والإعلانات</a>
      </nav>
    </section>
    <div id="appearance-dishes" className="scroll-mt-24 space-y-5"><CategoryImagesSettings /><FeaturedProductsSettings /></div>
    <div id="appearance-banners" className="scroll-mt-24"><BannerSettings /></div>
  </div>;
}
