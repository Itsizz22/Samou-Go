import { useAuth } from '@/hooks/useApi';
import type { ReactNode } from 'react';
import { ArrowRight, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@samou-go/ui';
import { BottomNav } from '@/components/BottomNav';
import { SupportWhatsAppButton } from '@/components/SupportWhatsAppButton';
import { useDrawer } from '@/components/NavigationDrawer';

interface ScreenShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/**
 * Samou' Go — layout for the router-backed customer screens.
 *
 * Brand header + content + the shared bottom tab bar. Keeps every screen
 * (Orders, Favorites, Profile, Search) visually consistent with the home feed.
 */
export function ScreenShell({ title, subtitle, children }: ScreenShellProps) {
  const { openDrawer } = useDrawer();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const auth = useAuth();
  const staff = auth.user?.role === "CAPTAIN" || auth.user?.role === "STORE_MANAGER";

  return (
    <main className="sq-customer-screen min-h-svh bg-canvas pb-28 font-sans text-ink">
      <header className="sq-page-header bg-surface px-5 text-ink">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <button
            type="button"
            aria-label={t('رجوع', 'Back')}
            onClick={() => navigate(-1)}
            className="sq-icon-button shrink-0 rounded-xl bg-canvas text-ink"
          >
            <ArrowRight size={22} className="ltr:rotate-180" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex-1 text-end">
              <h1 className="font-sans text-lg font-bold">{t(title, subtitle)}</h1>
            </div>
          </div>
          <button type="button" onClick={openDrawer} aria-label={t('القائمة', 'Menu')} className="sq-icon-button rounded-xl text-ink-muted"><Menu size={22} /></button>
        </div>
      </header>

      <div className="mx-auto max-w-md px-5 pt-6">{children}</div>

      {!staff && <BottomNav />}
      <SupportWhatsAppButton />
    </main>
  );
}
