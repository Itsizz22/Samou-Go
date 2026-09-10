import { Bell, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@samou-go/ui';
import { AccountSwitcher, useAuth } from '@/hooks/useApi';

/** Shared account controls, rendered only inside a staff account/settings tab. */
export function StaffAccountTools() {
  const auth = useAuth();
  const { t } = useLanguage();
  return (
    <section className="mx-auto my-5 w-full max-w-lg space-y-4" aria-label={t('الحساب والتفضيلات', 'Account and preferences')}>
      <Link to="/settings" className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-brand/20 bg-brand-tint p-5 text-center text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <span className="flex items-center gap-2" aria-hidden="true"><Settings size={22} /><Bell size={20} /></span>
        <span className="text-sm font-extrabold">{t('إعدادات الحساب والإشعارات', 'Account and notification settings')}</span>
        <span className="text-xs text-ink-muted">{t('الصوت، المظهر، اللغة وأذونات التطبيق', 'Sound, appearance, language and permissions')}</span>
      </Link>
      <AccountSwitcher auth={auth} compact />
    </section>
  );
}
