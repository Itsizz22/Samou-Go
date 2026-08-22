/**
 * Samou' Go — passwordless sign-in card (Firebase Phone Auth).
 *
 * Two steps:
 *   1. Enter phone number → Firebase sends OTP via SMS (free, worldwide)
 *   2. Enter the 6-digit code → Firebase verifies → server creates session
 *
 * Wire-up details:
 *   - reCAPTCHA invisible verifier (required by Firebase)
 *   - resend disabled until the countdown lapses
 *   - wrong code → error shake + haptic error + box clears for retry
 *   - correct code → success pulse + haptic success, then session is live
 *   - Falls back to server-side OTP if Firebase is not configured
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Fingerprint, Loader2, ShieldCheck, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';
import { ApiError } from '@/hooks/useApi';
import { useLanguage } from '@samou-go/ui';
import { hapticConfirm, hapticError, hapticSuccess } from '@/lib/haptics';
import { isValidPalestinianMobile } from '@/lib/phone';
import { fadeSlideUp } from '@/lib/motion';
import { OtpPinInput, type PinState } from '@/components/OtpPinInput';
import type { Auth } from '@samou-go/api-client';
import {
  sendFirebaseOtp,
  verifyFirebaseCode,
  exchangeFirebaseToken,
  resetRecaptcha,
} from '@/lib/firebase-auth';
import type { ConfirmationResult } from 'firebase/auth';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  promptBiometric,
  loadSavedSession,
  saveSession,
  type SavedSession,
} from '@/lib/biometric';
import type { PublicUser } from '@samou-go/shared-types';

export interface CustomerAuthGateProps {
  auth: Auth;
  reasonAr?: string;
  reasonEn?: string;
}

const PIN_LENGTH = 6;
const DEFAULT_RESEND_SECONDS = 30;

export function CustomerAuthGate({
  auth,
  reasonAr = 'سجّل الدخول لمتابعة طلبك',
  reasonEn = 'Sign in to continue',
}: CustomerAuthGateProps) {
  const [step, setStep] = useState<'phone' | 'code' | 'biometric'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pinState, setPinState] = useState<PinState>('idle');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<{ message: string; localizedMessage?: string } | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const timerRef = useRef<number | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';

  // ── Biometric support ────────────────────────────────────────────────
  // Biometric login disabled — @aparajita plugins crash the app.
  const biometricAvailable = false;
  const biometricLoading = false;

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      resetRecaptcha();
    };
  }, []);

  const startResendCountdown = (seconds: number) => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    setResendIn(seconds);
    timerRef.current = window.setInterval(() => {
      setResendIn((current) => {
        if (current <= 1 && timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return Math.max(0, current - 1);
      });
    }, 1_000);
  };

  /** Format Palestinian number to E.164 for Firebase. */
  const toE164 = (localPhone: string): string => {
    const digits = localPhone.replace(/\D/g, '');
    if (digits.startsWith('05')) return `+970${digits.slice(1)}`;
    return `+${digits}`;
  };

  /** Step 1: Send OTP via Firebase. */
  const handleRequestCode = async () => {
    setError(null);
    setSending(true);
    try {
      const e164 = toE164(phone);
      const confirmation = await sendFirebaseOtp(e164);
      confirmationRef.current = confirmation;
      await hapticConfirm();
      setCode('');
      setPinState('idle');
      setStep('code');
      startResendCountdown(DEFAULT_RESEND_SECONDS);
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      // Firebase-specific error mapping
      let localizedMessage = message;
      if (message.includes('auth/too-many-requests')) {
        localizedMessage = 'طلبات كثيرة جداً، حاول مجدداً بعد قليل / Too many requests — try again later';
        startResendCountdown(60);
      } else if (message.includes('auth/invalid-phone-number')) {
        localizedMessage = 'رقم الجوال غير صالح / Invalid phone number';
      } else if (message.includes('auth/quota-exceeded')) {
        localizedMessage = 'تم تجاوز الحد — يرجى المحاولة لاحقاً / Quota exceeded — try again later';
      } else {
        localizedMessage = 'تعذّر إرسال الرمز — تحقق من رقم الجوال / Could not send code — check your number';
      }
      setError({ message, localizedMessage });
      await hapticError();
      resetRecaptcha();
    } finally {
      setSending(false);
    }
  };

  // Biometric sign-in disabled — @aparajita plugins crash the native app.
  const handleBiometricLogin = async () => { setStep('phone'); };

  /** Step 2: Verify code with Firebase, then exchange for a session. */
  const handleVerify = async () => {
    if (code.length !== PIN_LENGTH || verifying || !confirmationRef.current) return;
    setError(null);
    setVerifying(true);
    setPinState('idle');
    try {
      // 1. Verify code with Firebase → get ID token.
      const idToken = await verifyFirebaseCode(confirmationRef.current, code);

      // 2. Exchange ID token for a Samou' Go session.
      const result = await exchangeFirebaseToken(idToken);

      await hapticSuccess();
      setPinState('success');
      // Store tokens and set user — same shape as the old verifyOtp response.
      auth.setUser(result.user);

      // Save session for biometric login on next launch.
      // Wrapped in try-catch to prevent crash if SecureStorage plugin fails.
      try {
        await saveSession({
          accessToken: '', // tokens are managed by auth context
          refreshToken: '',
          user: result.user as unknown as Record<string, unknown>,
        });
      } catch {
        // Biometric/secure storage may not work — non-fatal, app continues.
        console.warn('[auth] Could not save session to secure storage');
      }
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      let localizedMessage = message;
      if (message.includes('auth/wrong-code') || message.includes('invalid-verification-code')) {
        localizedMessage = 'رمز غير صحيح / Incorrect code';
      } else if (message.includes('auth/code-expired')) {
        localizedMessage = 'انتهت صلاحية الرمز — أعد الإرسال / Code expired — resend';
      } else if (message.includes('auth/session-expired')) {
        localizedMessage = 'انتهت الجلسة — أعد الإرسال / Session expired — resend';
      }
      setError({ message, localizedMessage });
      setPinState('error');
      setCode('');
      await hapticError();
      requestAnimationFrame(() => {
        document.querySelector<HTMLInputElement>('input[inputmode="numeric"]')?.focus();
      });
    } finally {
      setVerifying(false);
    }
  };

  const phoneValid = isValidPalestinianMobile(phone);
  const canResend = resendIn === 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink">
      {/* Invisible reCAPTCHA container — required by Firebase */}
      <div id="recaptcha-container" />

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
          onSubmit={(event) => {
            event.preventDefault();
            if (step === 'phone') void handleRequestCode();
            else void handleVerify();
          }}
          className="card-surface p-6 text-end"
          noValidate
        >
          <h1 className="text-base font-extrabold">{t(reasonAr, reasonEn)}</h1>

          {step === 'biometric' ? (
            <div className="mt-5 flex flex-col items-center gap-4">
              <motion.button
                type="button"
                onClick={() => void handleBiometricLogin()}
                disabled={biometricLoading}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/10 text-brand transition active:scale-95 disabled:opacity-60"
                whileTap={{ scale: 0.92 }}
              >
                {biometricLoading ? (
                  <Loader2 size={32} className="animate-spin" />
                ) : (
                  <Fingerprint size={32} strokeWidth={1.5} />
                )}
              </motion.button>
              <p className="text-sm font-semibold text-ink-muted">
                {t('افتح بالبصمة', 'Tap to unlock with biometrics')}
              </p>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="text-xs font-semibold text-brand transition active:scale-95"
              >
                {t('استخدم رقم الجوال', 'Use phone number instead')}
              </button>
            </div>
          ) : step === 'phone' ? (
            <>
              <label className="mt-5 block">
                <span className="text-xs font-bold">{t('رقم الجوال', 'Mobile number')}</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="05XXXXXXXX"
                  aria-invalid={Boolean(error)}
                  className="input-field mt-2 w-full text-start"
                  autoFocus
                />
              </label>
              <p className="mt-2 flex items-start gap-1.5 text-micro leading-relaxed text-ink-muted">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-brand" />
                {t(
                  'سنرسل رمز تحقق عبر رسالة نصية. الرمز صالح لثلاث دقائق.',
                  'We will text you a verification code. It is valid for three minutes.'
                )}
              </p>
            </>
          ) : (
            <>
              <div className="mt-5 flex items-center gap-2 text-[11px] text-ink-muted">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setError(null);
                    setCode('');
                    setPinState('idle');
                    resetRecaptcha();
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 font-semibold text-brand transition active:scale-95"
                >
                  <ArrowLeft size={13} />
                  تغيير الرقم
                </button>
                <span dir="ltr">{phone}</span>
              </div>

              <div className="mt-5">
                <OtpPinInput
                  length={PIN_LENGTH}
                  value={code}
                  onChange={(next) => {
                    setCode(next);
                    setError(null);
                    setPinState('idle');
                    if (next.length === PIN_LENGTH) void handleVerify();
                  }}
                  state={pinState}
                  disabled={verifying}
                  autoFocus
                  label={t('أدخل الرمز المكوّن من 6 أرقام', 'Enter the 6-digit code')}
                />
              </div>

              <div className="mt-4 flex items-center justify-center gap-1 text-[11px] text-ink-muted">
                <span>{t('لم يصلك الرمز؟', "Didn't get the code?")}</span>
                {canResend ? (
                  <button
                    type="button"
                    onClick={() => void handleRequestCode()}
                    disabled={sending}
                    className="font-bold text-brand transition active:scale-95 disabled:opacity-60"
                  >
                    {t('إعادة الإرسال', 'Resend')}
                  </button>
                ) : (
                  <span className="font-semibold" dir="ltr">
                    {resendIn}s
                  </span>
                )}
              </div>
            </>
          )}

          {error && (
            <p
              className="mt-4 flex items-start gap-2 rounded-xl bg-danger-tint p-3 text-[11px] font-semibold text-danger-ink"
              aria-live="assertive"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{isArabic ? error.message : (error.localizedMessage ?? error.message)}</span>
            </p>
          )}

          {step === 'phone' && (
            <button
              type="submit"
              disabled={!phoneValid || sending}
              className="btn-primary mt-5 w-full justify-center"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {t('إرسال رمز التحقق', 'Send code')}
            </button>
          )}
          {step === 'code' && (
            <button
              type="submit"
              disabled={verifying || code.length !== PIN_LENGTH}
              className="btn-primary mt-5 w-full justify-center"
            >
              {verifying ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              تأكيد <span dir="ltr">Verify</span>
            </button>
          )}
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
