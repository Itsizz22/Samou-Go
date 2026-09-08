/**
 * Samou' Go — "تبديل الحسابات" (Switch Accounts) card.
 *
 * Lists the up-to-three accounts saved on this device (the Multi-Account
 * Vault), highlights the active one, lets the user jump between them, add a
 * new session in place (without logging the current one out), or remove a
 * single account.
 *
 * Styling leans on the shared token layer every app's `index.css` defines
 * (`card-surface`, `input-field`, `btn-primary`, `bg-brand`, `text-ink-muted`,
 * `text-ink`, `text-ink-muted`, `border-line`, `danger-tint`) — same rules as
 * `SignInGate`, no CSS of its own.
 *
 * Switching/adding/removing resolves the new profile and pushes it through
 * `auth.setUser(...)`, so every consumer (the shared auth instance naming the
 * user) and every data screen keyed off `auth.user` (favorites, orders)
 * reconciles automatically.
 */

import { useState, type FormEvent } from 'react';
import { AlertTriangle, Check, Info, Loader2, LogOut, UserPlus } from 'lucide-react';
import type { Auth } from './useAuth';
import { useAccounts } from './useAccounts';
import { useToast } from './useToast';
import { useAppLanguage } from './language';
import { normalizeLoginPhone } from './SignInGate';
import type { UserRole } from '@samou-go/shared-types';

const ROLE_LABELS: Record<UserRole, [string, string]> = {
  CUSTOMER: ['عميل', 'Customer'],
  STORE_MANAGER: ['مدير متجر', 'Store manager'],
  CAPTAIN: ['كابتن توصيل', 'Captain'],
  ADMIN: ['مشرف', 'Admin'],
};

export interface AccountSwitcherProps {
  /** The value returned by `useAuth()` in the parent screen. */
  auth: Auth;
  compact?: boolean;
}

export function AccountSwitcher({ auth, compact = false }: AccountSwitcherProps) {
  const { accounts, activeId, full, busyId, switchTo, remove } = useAccounts();
  const toast = useToast();
  const isArabic = useAppLanguage() === 'ar';

  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const roleLabel = (role: UserRole): string => {
    const [ar, en] = ROLE_LABELS[role] ?? ['', role];
    return isArabic ? ar : en;
  };

  const handleSwitch = async (accountId: string): Promise<void> => {
    if (busyId) return;
    try {
      const profile = await switchTo(accountId);
      if (profile) {
        auth.setUser(profile);
        toast.success('تم تبديل الحساب', 'Account switched');
      } else {
        toast.error('تعذّر استعادة الجلسة', 'Could not restore this session');
      }
    } catch {
      toast.error('تعذّر التبديل', 'Switch failed');
    }
  };

  const handleRemove = async (accountId: string): Promise<void> => {
    if (busyId) return;
    try {
      const result = await remove(accountId);
      if (result.changedSession) {
        auth.setUser(result.nextProfile);
        toast.info(
          result.nextProfile ? 'تم تسجيل الخروج من الحساب' : 'تم تسجيل الخروج',
          result.nextProfile ? 'Account removed' : 'Signed out',
        );
      } else {
        toast.info('تمت إزالة الحساب', 'Account removed');
      }
    } catch {
      toast.error('تعذّرت إزالة الحساب', 'Could not remove that account');
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (auth.pending || !accounts.length) return;
    setFormError(null);
    void auth
      .signIn({ phone: normalizeLoginPhone(phone), password })
      .then((user) => {
        if (user) {
          setAdding(false);
          setPhone('');
          setPassword('');
          toast.success('تمت إضافة الحساب', 'Account added');
        } else {
          setFormError(
            isArabic
              ? (auth.error?.message ?? 'تعذّر تسجيل الدخول')
              : (auth.error?.localizedMessage ?? 'Could not sign in'),
          );
        }
      });
  };

  if (accounts.length === 0) return null;

  return (
    <section className={compact ? "" : "rounded-2xl border border-line bg-surface p-4 shadow-card"}>
      <div className="flex items-center gap-3">
        <span className={compact ? "hidden" : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-dark"}>
          <UserPlus size={18} />
        </span>
        <div className="flex-1 text-start">
          <h2 className="text-sm font-extrabold">{isArabic ? 'تبديل الحسابات' : 'Switch accounts'}</h2>
          <p className={compact ? "sr-only" : "text-micro text-ink-muted"}>
            {isArabic
              ? `ما يصل إلى ${accounts.length} من 3 حسابات محفوظة على هذا الجهاز`
              : `${accounts.length} of 3 accounts saved on this device`}
          </p>
        </div>
      </div>

      <ul className={compact ? "mt-2 space-y-2" : "mt-4 space-y-2"}>
        {accounts.map((account) => {
          const active = account.id === activeId;
          const busy = busyId === account.id;
          return (
            <li
              key={account.id}
              className={`rounded-xl border bg-surface ${compact ? "p-2" : "p-3"} transition ${
                active ? 'border-brand' : 'border-line'
              }`}
            >
              <div className="flex items-center gap-3">
                {account.avatar ? (
                  <img
                    src={account.avatar}
                    alt={account.name}
                    className="h-10 w-10 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-surface text-xs font-extrabold text-brand-deep">
                    {account.name.slice(0, 2)}
                  </span>
                )}
                <div className="min-w-0 flex-1 text-end">
                  <p className="flex items-center justify-start gap-1.5">
                    {active && (
                      <span className="flex items-center gap-0.5 rounded-full bg-brand px-2 py-0.5 text-micro font-bold text-white">
                        <Check size={10} strokeWidth={3} />
                        {isArabic ? 'الحالي' : 'Active'}
                      </span>
                    )}
                    <span className="truncate text-xs font-extrabold text-ink">{account.name}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-ink-muted" dir="ltr">
                    {account.phone} · {roleLabel(account.role)}
                  </p>
                </div>
                {active ? (
                  <button
                    type="button"
                    aria-label={isArabic ? 'تسجيل الخروج من الحساب الحالي' : 'Sign out of the active account'}
                    onClick={() => void handleRemove(account.id)}
                    disabled={busy}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted transition hover:bg-danger-tint hover:text-danger-ink disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <LogOut size={14} />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(busyId)}
                    onClick={() => void handleSwitch(account.id)}
                    className="min-h-11 shrink-0 rounded-lg bg-brand px-3 py-2 text-[11px] font-extrabold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 size={13} className="mx-auto animate-spin" />
                    ) : isArabic ? (
                      'تبديل'
                    ) : (
                      'Switch'
                    )}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!full && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand py-2.5 text-xs font-extrabold text-brand-deep transition hover:bg-brand-tint active:scale-[0.99]"
        >
          <UserPlus size={14} />
          {isArabic ? 'إضافة حساب آخر' : 'Add another account'}
        </button>
      )}

      {full && (
        <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-warning-tint px-3 py-2.5 text-[11px] font-bold text-warning-ink" role="status">
          <Info size={13} className="shrink-0" />
          {isArabic
            ? 'الحسابات ممتلئة (3/3) — أزل حساباً أولاً لإضافة حساب جديد'
            : 'Vault full (3/3) — remove an account first to add a new one'}
        </p>
      )}

      {!full && adding && (
        <form onSubmit={handleSubmit} className="mt-3 rounded-xl bg-canvas p-3" noValidate>
          <p className="text-[11px] font-bold text-ink-muted">
            {isArabic
              ? 'سجّل الدخول بحساب جديد — حسابك الحالي يبقى محفوظاً'
              : 'Sign in with another account — your current one stays saved'}
          </p>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="05XXXXXXXX"
            className="input-field mt-2 w-full text-start"
          />
          <input
            type="password"
            autoComplete="new-password"
            dir="ltr"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isArabic ? 'كلمة المرور' : 'Password'}
            className="input-field mt-2 w-full text-start"
          />
          {formError && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-danger-tint p-2.5 text-[11px] font-semibold text-danger-ink" role="alert">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFormError(null);
                setPhone('');
                setPassword('');
              }}
              className="flex-1 rounded-xl border border-line py-2.5 text-xs font-bold text-ink-muted transition active:scale-[0.98]"
            >
              {isArabic ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={auth.pending || phone.trim().length === 0 || password.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60"
            >
              {auth.pending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {isArabic ? 'إضافة' : 'Add'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}