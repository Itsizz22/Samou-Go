import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
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

  return (
    <main className="min-h-[100dvh] bg-canvas pb-28 text-ink">
      <header className="bg-brand px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-white shadow-brand">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <button
            type="button"
            aria-label={t('القائمة', 'Menu')}
            onClick={openDrawer}
            className="rounded-full p-2 transition hover:bg-surface/15 active:scale-95"
          >
            <Menu size={22} />
          </button>
          <div className="flex-1 text-end">
            <p className="font-heading text-[1.15rem] font-bold leading-relaxed tracking-[-0.015em]">{t(title, subtitle)}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md px-5 pt-6">{children}</div>

      <BottomNav />
      <SupportWhatsAppButton />
    </main>
  );
}
