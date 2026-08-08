import type { ReactNode } from 'react';
import { BottomNav } from '@/components/BottomNav';

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
  return (
    <main dir="rtl" className="min-h-screen bg-canvas pb-24 text-ink">
      <header className="bg-brand px-5 pb-5 pt-4 text-white">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div>
            <p className="text-lg font-bold">{title}</p>
            <p dir="ltr" className="text-[11px] text-white/80">
              {subtitle}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md px-5 pt-6">{children}</div>

      <BottomNav />
    </main>
  );
}
