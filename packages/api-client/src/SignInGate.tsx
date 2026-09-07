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
import { AlertTriangle, Loader2, LogIn } from 'lucide-react';
import type { Auth } from './useAuth';
import { useAppLanguage } from './language';

/**
 * Mirrors the API's `phoneSchema` (`packages/api/src/modules/auth/auth.schemas.ts`)
 * so the raw field is never sent to the wire: `+970…`, `00970…`, `+972…`, spaces
 * and dashes all collapse to the canonical `05XXXXXXXX` the server stores. A
 * mismatched payload would otherwise surface as a server-side validation error
 * (400/422) instead of a clean sign-in.
 */
export function normalizeLoginPhone(input: string): string {
  const digits = input.trim().replace(/[\s-()]/g, '').replace(/^\+/, '');
  if (digits.startsWith('00970')) return `0${digits.slice(5)}`;
  if (digits.startsWith('00972')) return `0${digits.slice(5)}`;
  if (digits.startsWith('970')) return `0${digits.slice(3)}`;
  if (digits.startsWith('972')) return `0${digits.slice(3)}`;
  return digits;
}

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
  const isArabic = useAppLanguage() === 'ar';

  // Field-level feedback from the server's Zod layer, keyed by dotted path.
  const phoneError = auth.error?.localizedFieldError('phone');
  const passwordError = auth.error?.localizedFieldError('password');
  // Only show the top-level message when it is not already shown under a field.
  const generalError = auth.error && !phoneError && !passwordError ? auth.error : null;

  const canSubmit = phone.trim().length > 0 && password.length > 0 && !auth.pending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    void auth.signIn({ phone: normalizeLoginPhone(phone), password });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <svg viewBox="0 0 512 512" width={56} height={56} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Samou Quick" style={{ display: 'block' }}>
            <defs>
              <linearGradient id="sg-emeraldBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#065F46" /><stop offset="50%" stopColor="#044E37" /><stop offset="100%" stopColor="#022C22" />
              </linearGradient>
              <linearGradient id="sg-boltGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FEF08A" /><stop offset="45%" stopColor="#FACC15" /><stop offset="100%" stopColor="#EAB308" />
              </linearGradient>
            </defs>
            <rect width="512" height="512" rx="128" fill="url(#sg-emeraldBg)" stroke="#10B981" strokeWidth="4" />
            <text x="190" y="295" textAnchor="middle" fill="#FFF" fontFamily="system-ui,-apple-system,sans-serif" fontSize="185" fontStyle="italic" fontWeight="900">S</text>
            <polygon points="325,128 275,240 320,240 252,382 360,215 315,215" fill="url(#sg-boltGold)" stroke="#FEF08A" strokeWidth="3" strokeLinejoin="round" />
          </svg>
          <p className="text-lg font-extrabold tracking-tight" dir="ltr">
            Samou Quick
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card-surface p-6 text-end" noValidate>
          <h1 className="text-base font-extrabold">{isArabic ? reasonAr : reasonEn}</h1>

          <label className="mt-5 block">
            <span className="text-xs font-bold">{isArabic ? 'رقم الجوال' : 'Mobile number'}</span>
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
            <span className="text-xs font-bold">{isArabic ? 'كلمة المرور' : 'Password'}</span>
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
              <span>{isArabic ? generalError.message : generalError.localizedMessage}</span>
            </p>
          )}

          <button type="submit" disabled={!canSubmit} className="btn-primary mt-5 w-full justify-center">
            {auth.pending ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {isArabic ? 'تسجيل الدخول' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
