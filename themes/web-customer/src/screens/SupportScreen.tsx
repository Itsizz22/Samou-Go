import { Home, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@samou-go/ui';
import { PageTransition } from '@/components/PageTransition';
import { BottomNav } from '@/components/BottomNav';

/** Authenticated support entry point while ticket detail screens are restored. */
export function SupportScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  return (
    <PageTransition>
      <main className="min-h-screen bg-canvas px-5 pb-28 pt-8 text-ink">
        <div className="mx-auto max-w-md rounded-2xl bg-surface p-6 text-center shadow-card">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand"><MessageCircle size={26} /></span>
          <h1 className="mt-4 text-lg font-extrabold">{t('المساعدة والدعم', 'Help & support')}</h1>
          <p className="mt-2 text-sm text-ink-muted">{t('سيتم توفير محادثة الدعم من هذا المكان قريباً.', 'Support chat will be available here soon.')}</p>
          <button type="button" onClick={() => navigate('/home')} className="btn-primary mt-6 w-full justify-center"><Home size={16} /> {t('الرئيسية', 'Home')}</button>
        </div>
        <BottomNav />
      </main>
    </PageTransition>
  );
}
