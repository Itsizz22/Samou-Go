/**
 * Samou' Go — password-based sign-in card.
 *
 * Simple Phone + Password authentication. No OTP, no Firebase.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, LockKeyhole, ShoppingCart } from 'lucide-react';
import { useLanguage } from '@samou-go/ui';
import { isValidPalestinianMobile } from '@/lib/phone';
import { fadeSlideUp } from '@/lib/motion';
import { motion } from 'framer-motion';
import type { Auth } from '@samou-go/api-client';
import { normalizePhone } from '@/lib/phone';

export interface CustomerAuthGateProps {
  auth: Auth;
  reasonAr?: string;
  reasonEn?: string;
}

export function CustomerAuthGate({
  auth,
  reasonAr = 'سجّل الدخول لمتابعة طلبك',
  reasonEn = 'Sign in to continue',
}: CustomerAuthGateProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';

  const phoneValid = isValidPalestinianMobile(phone);
  const canSubmit = phoneValid && password.length > 0 && !auth.pending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await auth.signIn({ phone: normalizePhone(phone), password });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink">
      <motion.div
        className="w-full max-w-sm"
        variants={fadeSlideUp}
        initial="initial"
        animate="animate"
      >
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-brand">
            <ShoppingCart size={26} strokeWidth={2.5} />
          </span>
          <p className="text-lg font-extrabold tracking-tight" dir="ltr">
            Samou' Go
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="card-surface p-6 text-end"
          noValidate
        >
          <h1 className="text-base font-extrabold">{t(reasonAr, reasonEn)}</h1>

          <label className="mt-5 block">
            <span className="text-xs font-bold">{t('رقم الجوال', 'Mobile number')}</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/[^\d+]/g, ''))}
              placeholder="05XXXXXXXX"
              className="input-field mt-2 w-full text-start"
              autoFocus
            />
          </label>
          {phone.length > 0 && !phoneValid && (
            <p className="mt-1 text-xs text-danger-ink">
              {t('يرجى إدخال رقم جوال فلسطيني صالح يبدأ بـ 059 أو 056', 'Please enter a valid Palestinian mobile number starting with 059 or 056')}
            </p>
          )}

          <label className="mt-4 block">
            <span className="text-xs font-bold">{t('كلمة المرور', 'Password')}</span>
            <span className="relative mt-2 block" dir="ltr">
              <input
                className="input-field w-full pe-11"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute end-3 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted"
                aria-label={t(showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور', showPassword ? 'Hide password' : 'Show password')}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {auth.error && (
            <p
              className="mt-4 flex items-start gap-2 rounded-xl bg-danger-tint p-3 text-[11px] font-semibold text-danger-ink"
              aria-live="assertive"
            >
              <span>{isArabic ? auth.error.message : auth.error.localizedMessage}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary mt-5 w-full justify-center"
          >
            {auth.pending ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
            {t('تسجيل الدخول', 'Sign in')}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-muted">
          <Link to="/login" className="font-bold text-brand">
            {t('تسجيل الدخول بكلمة المرور', 'Login with password instead')}
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
