import { BadgePercent, Heart, User, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@samou-go/ui';
import { ScreenShell } from '@/components/ScreenShell';

const items = [
  { to: '/offers', title: 'العروض', en: 'Offers', description: 'اكتشف العروض والخصومات', descriptionEn: 'Explore offers and discounts', icon: BadgePercent },
  { to: '/favorites', title: 'المفضلة', en: 'Favorites', description: 'متاجرك ومنتجاتك المفضلة', descriptionEn: 'Your favorite stores and products', icon: Heart },
  { to: '/profile', title: 'حسابي', en: 'My account', description: 'بياناتك وإعدادات حسابك', descriptionEn: 'Your details and account settings', icon: User },
];

export function MenuScreen() {
  const { t } = useLanguage();
  return (
    <ScreenShell title="القائمة" subtitle="Menu">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map(({ to, title, en, description, descriptionEn, icon: Icon }) => (
          <Link key={to} to={to} className="flex min-h-24 items-center gap-4 border-b border-line p-4 last:border-b-0 hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-canvas text-brand"><Icon size={24} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold">{t(title, en)}</span>
              <span className="mt-1 block text-sm text-ink-muted">{t(description, descriptionEn)}</span>
            </span>
            <ChevronLeft size={20} className="shrink-0 text-ink-muted ltr:rotate-180" />
          </Link>
        ))}
      </div>
    </ScreenShell>
  );
}
