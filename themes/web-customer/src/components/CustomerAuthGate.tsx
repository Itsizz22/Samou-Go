/**
 * Samou' Go — passwordless sign-in card (OTP-first).
 *
 * Two steps: request a code on a mobile number, then type the 6-digit code.
 * Wire-up details:
 *   - resend disabled until the countdown lapses (seeded from the server's
 *     `retryAfterSeconds`, so a rate-limited user sees the real wait)
 *   - wrong code → error shake + haptic error + the box clears for a retry
 *   - correct code → success pulse + haptic success, then the session is live
 *   - the whole thing renders against the shared token layer (`card-surface`,
 *     `input-field`, `btn-primary`), same as the legacy password gate
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, ShieldCheck, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';
import { ApiError, requestOtp, verifyOtp } from '@/hooks/useApi';
import { hapticConfirm, hapticError, hapticSuccess } from '@/lib/haptics';
import { isValidPalestinianMobile } from '@/lib/phone';
import { fadeSlideUp } from '@/lib/motion';
import { OtpPinInput, type PinState } from '@/components/OtpPinInput';
import type { Auth } from '@samou-go/api-client';

export interface CustomerAuthGateProps {
  auth: Auth;
  reasonAr?: string;
  reasonEn?: string;
}

const PIN_LENGTH = 6;
/** Default resend cooldown when the server does not hint a longer one. */
const DEFAULT_RESEND_SECONDS = 30;

export function CustomerAuthGate({
  auth,
  reasonAr = 'سجّل الدخول لمتابعة طلبك',
  reasonEn = 'Sign in to continue',
}: CustomerAuthGateProps) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pinState, setPinState] = useState<PinState>('idle');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
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

  const handleRequestCode = async () => {
    setError(null);
    setSending(true);
    try {
      const result = await requestOtp({ phone });
      await hapticConfirm();
      setCode('');
      setPinState('idle');
      setStep('code');
      startResendCountdown(Math.max(result.retryAfterSeconds, DEFAULT_RESEND_SECONDS));
    } catch (cause) {
      const apiError =
        cause instanceof ApiError
          ? cause
          : new ApiError('UNKNOWN', cause instanceof Error ? cause.message : String(cause));
      setError(apiError);
      await hapticError();
      if (apiError.code === 'OTP_RATE_LIMITED') {
        startResendCountdown(60);
      }
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== PIN_LENGTH || verifying) return;
    setError(null);
    setVerifying(true);
    setPinState('idle');
    try {
      const result = await verifyOtp({ phone, code });
      await hapticSuccess();
      setPinState('success');
      auth.setUser(result.user);
    } catch (cause) {
      const apiError =
        cause instanceof ApiError
          ? cause
          : new ApiError('UNKNOWN', cause instanceof Error ? cause.message : String(cause));
      setError(apiError);
      setPinState('error');
      setCode('');
      await hapticError();
      // Returning focus so the customer can immediately retype.
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
          <h1 className="text-base font-extrabold">{reasonAr}</h1>
          <p className="mt-1 text-[11px] text-ink-muted" dir="ltr">
            {reasonEn}
          </p>

          {step === 'phone' ? (
            <>
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
                  aria-invalid={Boolean(error)}
                  className="input-field mt-2 w-full text-start"
                  autoFocus
                />
              </label>
              <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-ink-muted">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-brand" />
                سنرسل رمز تحقق عبر رسالة نصية. الرمز صالح لثلاث دقائق.
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
                  label="أدخل الرمز المكوّن من 6 أرقام / Enter the 6-digit code"
                />
              </div>

              <div className="mt-4 flex items-center justify-center gap-1 text-[11px] text-ink-muted">
                <span>لم يصلك الرمز؟</span>
                {canResend ? (
                  <button
                    type="button"
                    onClick={() => void handleRequestCode()}
                    disabled={sending}
                    className="font-bold text-brand transition active:scale-95 disabled:opacity-60"
                  >
                    إعادة الإرسال <span dir="ltr">Resend</span>
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
              <span>{error.message}</span>
            </p>
          )}

          {step === 'phone' && (
            <button
              type="submit"
              disabled={!phoneValid || sending}
              className="btn-primary mt-5 w-full justify-center"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              إرسال رمز التحقق <span dir="ltr">Send code</span>
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
      </motion.div>
    </main>
  );
}
