/**
 * Samou' Go — sign-in card.
 *
 * Shown by any screen whose data needs a token. Deliberately plain: phone and
 * password, the two fields `LoginInput` actually has. Registration is a
 * separate flow and is not offered here.
 *
 * Styling leans entirely on the shared token layer every app's `index.css`
 * defines (`card-surface`, `input-field`, `btn-primary`, `bg-brand`,
 * `text-ink-muted`), so this component ships no CSS of its own — see
 * DESIGN_SYSTEM.md.
 */

import { useState, type FormEvent } from 'react';
import { AlertTriangle, Loader2, LogIn, ShoppingCart } from 'lucide-react';
import type { Auth } from './useAuth';

export interface SignInGateProps {
  /** The value returned by `useAuth()` in the parent screen. */
  auth: Auth;
  /** Bilingual line explaining why sign-in is needed on this screen. */
  reasonAr?: string;
  reasonEn?: string;
}

export function SignInGate({
  auth,
  reasonAr = 'سجّل الدخول لمتابعة طلبك',
  reasonEn = 'Sign in to continue with your order',
}: SignInGateProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // Field-level feedback from the server's Zod layer, keyed by dotted path.
  const phoneError = auth.error?.fieldError('phone');
  const passwordError = auth.error?.fieldError('password');
  // Only show the top-level message when it is not already shown under a field.
  const generalError = auth.error && !phoneError && !passwordError ? auth.error : null;

  const canSubmit = phone.trim().length > 0 && password.length > 0 && !auth.pending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    void auth.signIn({ phone: phone.trim(), password });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-brand">
            <ShoppingCart size={26} strokeWidth={2.5} />
          </span>
          <p className="text-lg font-extrabold tracking-tight" dir="ltr">
            Samou' Go
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card-surface p-6 text-end" noValidate>
          <h1 className="text-base font-extrabold">{reasonAr}</h1>
          <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
            {reasonEn}
          </p>

          <label className="mt-5 block">
            <span className="text-xs font-bold">رقم الجوال</span>
            <span className="ms-2 text-[10px] text-ink-muted" dir="ltr">
              Mobile number
            </span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="05XXXXXXXX"
              aria-invalid={Boolean(phoneError)}
              className="input-field mt-2 w-full text-start"
            />
            {phoneError && (
              <span className="mt-1 block text-[11px] font-semibold text-danger-ink">{phoneError}</span>
            )}
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-bold">كلمة المرور</span>
            <span className="ms-2 text-[10px] text-ink-muted" dir="ltr">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(passwordError)}
              className="input-field mt-2 w-full text-start"
            />
            {passwordError && (
              <span className="mt-1 block text-[11px] font-semibold text-danger-ink">{passwordError}</span>
            )}
          </label>

          {generalError && (
            <p
              className="mt-4 flex items-start gap-2 rounded-xl bg-danger-tint p-3 text-[11px] font-semibold text-danger-ink"
              aria-live="assertive"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{generalError.message}</span>
            </p>
          )}

          <button type="submit" disabled={!canSubmit} className="btn-primary mt-5 w-full justify-center">
            {auth.pending ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            تسجيل الدخول <span dir="ltr">Sign in</span>
          </button>
        </form>
      </div>
    </main>
  );
}
