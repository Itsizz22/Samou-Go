import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { BrandLogo } from '@samou-go/ui';
import { ApiError, requestOtp, verifyOtp, useAuth } from '@/hooks/useApi';
import { AuthSupportContact } from '@/components/AuthSupportContact';
import { OtpPinInput } from '@/components/OtpPinInput';
import { isValidPalestinianMobile, normalizePhone } from '@/lib/phone';
import { roleHomePath } from '@/lib/roles';

// Enable only after configuring and testing the real SMS provider on the API.
const OTP_ENABLED = import.meta.env.VITE_OTP_ENABLED === 'true';

export function PhoneVerificationScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false);
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  async function sendCode() {
    if (!OTP_ENABLED || pending.current || seconds || !isValidPalestinianMobile(phone)) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await requestOtp({ phone: normalizePhone(phone) });
      setNow(Date.now());
      setRetryAt(Date.now() + Math.max(60, result.retryAfterSeconds) * 1000);
      if (!result.dispatched) {
        setError('خدمة إرسال الرسائل غير مفعّلة بعد. لم يُرسل رمز إلى هاتفك.');
        return;
      }
      setSent(true);
      setCode('');
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'تعذّر إرسال الرمز. تحقق من الاتصال وحاول مجددًا.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function confirmCode() {
    if (!OTP_ENABLED || !sent || pending.current || !/^\d{6}$/.test(code)) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await verifyOtp({ phone: normalizePhone(phone), code });
      auth.setUser(result.user);
      navigate(roleHomePath(result.user.role), { replace: true });
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'تعذّر التحقق. حاول مجددًا.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8 text-ink">
      <section className="w-full max-w-md rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-8" aria-labelledby="phone-verification-title">
        <div className="flex items-center justify-between">
          <BrandLogo size={56} />
          <Link to="/login" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-ink-muted focus-visible:ring-2 focus-visible:ring-brand"><ArrowRight size={18} /> تسجيل الدخول</Link>
        </div>
        <div className="mb-6 mt-8">
          <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand"><ShieldCheck size={28} /></span>
          <p className="mb-2 text-xs font-bold text-brand">حسابك بأمان</p>
          <h1 id="phone-verification-title" className="text-2xl font-extrabold">تأكيد رقم الهاتف</h1>
          <p className="mt-3 text-sm leading-7 text-ink-muted">{sent ? 'أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه برسالة نصية إلى هاتفك.' : 'خطوة بسيطة للتأكد أن هذا الرقم يخصّك وحماية حسابك.'}</p>
        </div>
        {!OTP_ENABLED && <p role="status" className="mb-5 rounded-xl border border-line bg-canvas p-3 text-sm leading-6 text-ink-muted">خدمة التحقق قيد التجهيز. سيتاح إرسال الرمز عند تفعيل مزوّد الرسائل.</p>}
        <form onSubmit={event => { event.preventDefault(); void (sent ? confirmCode() : sendCode()); }}>
          {!sent ? <label className="block text-sm font-bold">رقم الهاتف
            <span className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-canvas px-3 focus-within:ring-2 focus-within:ring-brand/30">
              <Smartphone size={20} className="shrink-0 text-brand" />
              <input type="tel" dir="ltr" autoComplete="tel" placeholder="059 000 0000" value={phone} disabled={busy} onChange={event => setPhone(event.target.value)} className="min-h-12 min-w-0 flex-1 bg-transparent text-start outline-none" />
            </span>
            <span className="mt-2 block text-xs font-normal text-ink-muted">يدعم الأرقام المحلية ومقدّمتي 970 و972.</span>
          </label> : <div className="mb-4 flex items-center justify-between gap-2">
            <b dir="ltr" className="text-sm">{normalizePhone(phone)}</b>
            <button type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); setError(''); }} className="min-h-11 rounded-lg px-2 text-sm font-bold text-brand focus-visible:ring-2 focus-visible:ring-brand">تعديل الرقم</button>
          </div>}
          {(sent || !OTP_ENABLED) && <div className="mt-6"><OtpPinInput value={code} onChange={setCode} disabled={busy || !OTP_ENABLED} label="رمز التحقق" state={error && sent ? 'error' : 'idle'} /></div>}
          {error && <p role="alert" className="mt-4 rounded-xl bg-danger-tint p-3 text-sm text-danger-ink">{error}</p>}
          <button type="submit" disabled={!OTP_ENABLED || busy || (sent ? code.length !== 6 : !isValidPalestinianMobile(phone) || seconds > 0)} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 font-bold text-white transition-transform active:scale-95 disabled:opacity-50 motion-reduce:transition-none">{busy && <Loader2 size={18} className="animate-spin motion-reduce:animate-none" />}{sent ? 'تأكيد ومتابعة' : 'إرسال رمز التحقق'}</button>
          {sent && <button type="button" onClick={() => void sendCode()} disabled={busy || seconds > 0} className="mt-2 min-h-12 w-full rounded-xl text-sm font-bold text-brand disabled:text-ink-muted">{seconds ? `إعادة الإرسال بعد ${seconds} ثانية` : 'لم يصلك الرمز؟ أعد الإرسال'}</button>}
          {!sent && seconds > 0 && <p role="status" className="mt-3 text-center text-xs text-ink-muted">يمكنك طلب رمز آخر بعد {seconds} ثانية</p>}
        </form>
        <AuthSupportContact />
      </section>
    </main>
  );
}
