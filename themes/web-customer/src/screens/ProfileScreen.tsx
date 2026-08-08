import { SignInGate, useAuth } from '@/hooks/useApi';
import { Loader2, LogOut, UserRound } from 'lucide-react';
import { ScreenShell } from '@/components/ScreenShell';

/**
 * Samou' Go — `/profile`.
 *
 * Signed-in profile summary with a sign-out action; anonymous visitors see the
 * sign-in gate.
 */
export function ProfileScreen() {
  const auth = useAuth();

  return (
    <ScreenShell title="الملف الشخصي" subtitle="Profile">
      {!auth.ready ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-brand" aria-label="Loading" />
        </div>
      ) : !auth.user ? (
        <SignInGate auth={auth} reasonAr="سجّل الدخول لإدارة حسابك" reasonEn="Sign in to manage your account" />
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-surface text-brand">
              <UserRound size={26} />
            </span>
            <div className="min-w-0 text-end">
              <h2 className="truncate text-base font-extrabold">{auth.user.name}</h2>
              <p className="mt-0.5 text-xs text-ink-muted" dir="ltr">
                {auth.user.phone} · {auth.user.role}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={auth.signOut}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-danger-tint bg-danger-tint/40 px-4 py-2.5 text-xs font-bold text-danger-ink transition hover:bg-danger-tint"
          >
            <LogOut size={15} />
            تسجيل الخروج <span dir="ltr">Sign out</span>
          </button>
        </section>
      )}
    </ScreenShell>
  );
}
