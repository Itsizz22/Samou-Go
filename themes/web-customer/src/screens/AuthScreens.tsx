import { useEffect, useState } from 'react';
import { Crosshair, Eye, EyeOff, Loader2, LockKeyhole, MapPin, ShoppingCart } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ApiError,
  register,
  requestOtp,
  resetPassword,
  setSessionPersistence,
  updateMyLocation,
  useAuth,
  useToast,
} from '@/hooks/useApi';
import { OtpPinInput } from '@/components/OtpPinInput';
import { useLanguage } from '@samou-go/ui';
import { normalizePhone, isValidPalestinianMobile } from '@/lib/phone';
import { roleHomePath } from '@/lib/roles';
import {
  ADDRESS_TAG_META,
  ADDRESS_TAGS,
  readSavedAddresses,
  upsertAddress,
  writeSavedAddresses,
  type AddressTag,
} from '@/lib/address-book';

const phoneValid = (phone: string) => isValidPalestinianMobile(phone);

const passwordStrong = (password: string) => password.length >= 8;

interface LocalizedText {
  ar: string;
  en: string;
}

/**
 * Turns any API failure into a banner sentence. Field-level validation
 * messages (422 `details`) are shown verbatim — a malformed phone says so
 * instead of hiding behind the generic "Something went wrong".
 */
function apiErrorMessage(cause: unknown, fallback: LocalizedText): LocalizedText {
  if (!(cause instanceof ApiError)) return fallback;
  const fieldMessages = cause.details.map(detail => detail.message).filter(Boolean);
  return fieldMessages.length > 0
    ? { ar: fieldMessages.join(' · '), en: cause.localizedMessage }
    : { ar: cause.message, en: cause.localizedMessage };
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10 text-ink"
    >
      <section className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-card">
        <div className="mb-7 flex flex-col items-center gap-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-brand">
            <ShoppingCart size={26} />
          </span>
          <strong dir="ltr" className="text-lg">
            Samou' Go
          </strong>
        </div>
        {children}
      </section>
    </main>
  );
}

function PasswordInput({
  value,
  onChange,
  label,
  autoComplete = 'current-password',
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const { t } = useLanguage();
  return (
    <label className="mt-4 block text-sm font-bold">
      {label}
      <span className="relative mt-1.5 block" dir="ltr">
        <input
          className="input-field w-full pe-11"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={event => onChange(event.target.value)}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute end-3 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted"
          aria-label={t(visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور', visible ? 'Hide password' : 'Show password')}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

function ErrorBanner({ error }: { error: string | LocalizedText | null }) {
  const { language } = useLanguage();
  if (!error) return null;
  const message = typeof error === 'string' ? error : language === 'ar' ? error.ar : error.en;
  return (
    <p
      role="alert"
      className="mt-4 rounded-xl bg-danger-tint px-3 py-2 text-xs font-semibold text-danger-ink"
    >
      {message}
    </p>
  );
}

export function LoginScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);

  if (auth.ready && auth.user) return <Navigate to={roleHomePath(auth.user.role)} replace />;
  const valid = phoneValid(phone) && password.length > 0;
  return (
    <AuthShell>
      <h1 className="text-xl font-extrabold">{t('تسجيل الدخول', 'Sign in to your account')}</h1>
      {location.state &&
        typeof location.state === 'object' &&
        'resetComplete' in location.state && (
          <p
            role="status"
            className="mt-4 rounded-xl bg-brand-surface px-3 py-2 text-xs font-semibold text-brand-deep"
          >
            تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.
          </p>
        )}
      <form
        noValidate
        onSubmit={event => {
          event.preventDefault();
          if (!valid || auth.pending) return;
          setSessionPersistence(remember);
          void auth.signIn({ phone: normalizePhone(phone), password }).then(user => {
            if (user) navigate(roleHomePath(user.role), { replace: true });
          });
        }}
      >
        <label className="mt-5 block text-sm font-bold">
          رقم الجوال
          <input
            className="input-field mt-1.5 w-full"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={event => setPhone(event.target.value.replace(/[^\d+]/g, ''))}
            placeholder="05XXXXXXXX"
            aria-invalid={phone.length > 0 && !phoneValid(phone)}
          />
        </label>
        {phone.length > 0 && !phoneValid(phone) && (
          <p className="mt-1 text-xs text-danger-ink">
            يرجى إدخال رقم جوال فلسطيني صالح يبدأ بـ 059 أو 056
          </p>
        )}
        <PasswordInput label="كلمة المرور" value={password} onChange={setPassword} />
        <div className="mt-4 flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="font-bold text-brand">
            نسيت كلمة المرور؟
          </Link>
          <label className="flex items-center gap-2 text-ink-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={event => setRemember(event.target.checked)}
            />{' '}
            تذكرني
          </label>
        </div>
        <ErrorBanner error={auth.error ? { ar: auth.error.message, en: auth.error.localizedMessage } : null} />
        <button
          type="submit"
          disabled={!valid || auth.pending}
          className="btn-primary mt-5 w-full justify-center disabled:opacity-60"
        >
          {auth.pending ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <LockKeyhole size={18} />
          )}{' '}
          تسجيل الدخول
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-muted">
        ليس لديك حساب؟{' '}
        <Link to="/register" className="font-bold text-brand">
          أنشئ حساباً
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useLanguage();
  const [step, setStep] = useState<'form' | 'location'>('form');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LocalizedText | null>(null);
  const valid = name.trim().length >= 2 && phoneValid(phone) && password.length >= 8 && password === confirmPassword && accepted;
  const [locationText, setLocationText] = useState('');
  const [locationTag, setLocationTag] = useState<AddressTag>('home');
  const [geoPending, setGeoPending] = useState(false);
  const [geoApplied, setGeoApplied] = useState(false);
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  if (auth.ready && auth.user) return <Navigate to={roleHomePath(auth.user.role)} replace />;

  /**
   * Direct registration — no OTP. The server creates the account, hashes
   * the password, marks the user verified, and returns access + refresh
   * tokens so we can enter the app immediately.
   */
  const handleRegister = async () => {
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await register({
        name: name.trim(),
        phone: normalizePhone(phone),
        password,
      });
      // Store tokens via the API client's token layer.
      const { setToken, setRefreshToken } = await import('@samou-go/api-client');
      setToken(result.accessToken);
      setRefreshToken(result.refreshToken ?? null);
      // Refresh auth context to pick up the user profile.
      await auth.refresh();
      toast.success('تم إنشاء الحساب — أهلاً بك!', 'Account created — welcome!');
      setStep('location');
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      let localizedMessage: LocalizedText;
      if (message.includes('already registered') || message.includes('مسجّل مسبقاً')) {
        localizedMessage = { ar: 'رقم الجوال مسجّل مسبقاً', en: 'This phone number is already registered' };
      } else {
        localizedMessage = apiErrorMessage(cause, { ar: 'تعذر إنشاء الحساب.', en: 'Could not create account.' });
      }
      setError(localizedMessage);
    } finally {
      setPending(false);
    }
  };

  /* ---- Location onboarding (step 2) -------------------------------------- */

  const saveLocationAndEnter = () => {
    if (pending) return;
    setError(null);
    const text = locationText.trim();
    if (!text) {
      navigate('/', { replace: true });
      return;
    }
    const saved = readSavedAddresses();
    const address = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `addr-${Date.now()}`,
      label: ADDRESS_TAG_META[locationTag].ar,
      tag: locationTag,
      addressText: text,
      addressNote: geoApplied ? '📍 الموقع الحالي' : undefined,
      ...(geoCoords ? { lat: geoCoords.lat, lng: geoCoords.lng } : {}),
    };
    writeSavedAddresses(upsertAddress(saved, address));
    if (geoCoords) {
      void updateMyLocation(geoCoords.lat, geoCoords.lng).catch(() => undefined);
    }
    navigate('/', { replace: true });
  };

  const shareCurrentLocation = () => {
    if (geoPending || !('geolocation' in navigator)) return;
    setGeoPending(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        setGeoCoords({ lat: latitude, lng: longitude });
        setLocationText(prev =>
          prev.trim() ? prev : `موقعي الحالي — ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
        );
        setGeoApplied(true);
        setGeoPending(false);
      },
      () => {
        setGeoPending(false);
        setError({ ar: 'تعذّر تحديد موقعك — اكتب عنوانك يدوياً', en: 'Location unavailable — type your address' });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  return (
    <AuthShell>
      <h1 className="text-xl font-extrabold">{t('إنشاء حساب', 'Create your account')}</h1>
      {step === 'form' && (
        <form
          noValidate
          onSubmit={event => {
            event.preventDefault();
            void handleRegister();
          }}
        >
          <label className="mt-5 block text-sm font-bold">
            الاسم الكامل
            <input
              className="input-field mt-1.5 w-full"
              autoComplete="name"
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </label>
          <label className="mt-4 block text-sm font-bold">
            رقم الجوال
            <input
              className="input-field mt-1.5 w-full"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={event => setPhone(event.target.value.replace(/[^\d+]/g, ''))}
              placeholder="05XXXXXXXX"
            />
            {phone.length > 0 && !phoneValid(phone) && (
              <p className="mt-1 text-xs text-danger-ink">
                يرجى إدخال رقم جوال فلسطيني صالح يبدأ بـ 059 أو 056
              </p>
            )}
          </label>
          <label className="mt-4 block text-sm font-bold">
            كلمة المرور
            <input
              type="password"
              className="input-field mt-1.5 w-full"
              dir="ltr"
              autoComplete="new-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="كلمة مرور (٨ أحرف على الأقل)"
            />
            {password.length > 0 && password.length < 8 && (
              <p className="mt-1 text-xs text-danger-ink">كلمة المرور يجب أن تكون ٨ أحرف على الأقل</p>
            )}
          </label>
          <label className="mt-4 block text-sm font-bold">
            تأكيد كلمة المرور
            <input
              type="password"
              className="input-field mt-1.5 w-full"
              dir="ltr"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder="أعد إدخال كلمة المرور"
            />
            {confirmPassword.length > 0 && confirmPassword !== password && (
              <p className="mt-1 text-xs text-danger-ink">كلمة المرور غير متطابقة</p>
            )}
          </label>
          <label className="mt-4 flex items-start gap-2 text-sm text-ink-muted">
            <input
              className="mt-1"
              type="checkbox"
              checked={accepted}
              onChange={event => setAccepted(event.target.checked)}
            />
            أوافق على الشروط وسياسة الخصوصية.
          </label>
          <ErrorBanner error={error} />
          <button
            type="submit"
            disabled={!valid || pending}
            className="btn-primary mt-5 w-full justify-center disabled:opacity-60"
          >
            {pending && <Loader2 className="animate-spin" size={18} />} إنشاء الحساب
          </button>
        </form>
      )}
      {step === 'location' && (
        <div>
          <div className="mt-5 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-brand">
              <MapPin size={20} />
            </span>
            <div>
              <h2 className="text-sm font-extrabold">{t('أين تسكن؟', 'Where should we deliver?')}</h2>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            شارك حيّك وعنوانك لتجهيز طلباتك بشكل أسرع — يمكنك تغييره لاحقاً من الملف الشخصي.
          </p>
          <label className="mt-4 block text-sm font-bold">
            العنوان
            <textarea
              className="input-field mt-1.5 min-h-24 w-full resize-none"
              dir="rtl"
              value={locationText}
              onChange={event => setLocationText(event.target.value)}
              placeholder="الحي / الشارع / علامة مميزة — مثل: شارع السموع الرئيسي، بجانب المسجد"
              aria-label="Delivery address"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Address tag">
            {ADDRESS_TAGS.map(tag => (
              <button
                key={tag}
                type="button"
                role="radio"
                aria-checked={locationTag === tag}
                onClick={() => setLocationTag(tag)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                  locationTag === tag
                    ? 'bg-brand text-white'
                    : 'bg-surface text-ink-muted shadow-card'
                }`}
              >
                {t(ADDRESS_TAG_META[tag].ar, ADDRESS_TAG_META[tag].en)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={shareCurrentLocation}
            disabled={geoPending}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-xs font-bold text-brand-deep transition hover:bg-brand-surface disabled:opacity-60"
          >
            {geoPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Crosshair size={15} />
            )}
            {geoApplied ? (
              <>{t('تم تحديد موقعك', 'Location captured')}</>
            ) : (
              <>
                {t('شارك موقعي الحالي', 'Use my location')}
              </>
            )}
          </button>
          <ErrorBanner error={error} />
          <button
            type="button"
            onClick={saveLocationAndEnter}
            className="btn-primary mt-5 w-full justify-center"
          >
            {t('حفظ والمتابعة', 'Save & continue')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="mt-3 w-full text-sm font-bold text-ink-muted"
          >
            {t('تخطي الآن', 'Skip for now')}
          </button>
        </div>
      )}
      <p className="mt-5 text-center text-sm text-ink-muted">
        لديك حساب؟{' '}
        <Link to="/login" className="font-bold text-brand">
          تسجيل الدخول
        </Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LocalizedText | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const RESEND_COOLDOWN = 60;
  useEffect(() => {
    if (!resendIn) return;
    const timer = window.setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);
  const sendCode = () => {
    if (!phoneValid(phone) || pending) return;
    setPending(true);
    setError(null);
    void requestOtp({ phone: normalizePhone(phone) })
      .then(() => {
        setStep(2);
        setResendIn(RESEND_COOLDOWN);
      })
      .catch((cause: unknown) => {
        const apiErr = cause as { code?: string; status?: number } | null;
        let message: LocalizedText;
        if (apiErr?.code === 'OTP_RATE_LIMITED') {
          message = { ar: 'طلبات كثيرة جداً — يرجى الانتظار قبل طلب رمز جديد', en: 'Too many requests — please wait before requesting a new code' };
        } else if (apiErr?.code === 'SMS_DELIVERY_FAILED') {
          message = { ar: 'تعذّر إرسال رمز التحقق — يرجى المحاولة مجدداً', en: 'Could not send verification code — please try again' };
        } else if (apiErr?.status === 429) {
          message = { ar: 'تم تجاوز حد الطلبات — يرجى المحاولة لاحقاً', en: 'Rate limit exceeded — please try again later' };
        } else if (apiErr?.status && apiErr?.status >= 500) {
          message = { ar: 'خطأ في الخادم — يرجى المحاولة لاحقاً', en: 'Server error — please try again later' };
        } else {
          message = apiErrorMessage(cause, { ar: 'تعذر إرسال الرمز.', en: 'Could not send the code.' });
        }
        setError(message);
      })
      .finally(() => setPending(false));
  };
  const finish = () => {
    if (code.length !== 6 || !passwordStrong(password) || password !== confirm || pending) return;
    setPending(true);
    setError(null);
    void resetPassword({ phone: normalizePhone(phone), code, password })
      .then(() => navigate('/login', { replace: true, state: { resetComplete: true } }))
      .catch((cause: unknown) => {
        const apiErr = cause as { code?: string; status?: number } | null;
        let message: LocalizedText;
        if (apiErr?.code === 'INVALID_FEE' || apiErr?.code === 'VOUCHER_NOT_FOUND') {
          message = { ar: 'رمز التحقق غير صحيح أو منتهي الصلاحية', en: 'Invalid or expired verification code' };
        } else if (apiErr?.status === 400) {
          message = { ar: 'رمز التحقق غير صحيح — يرجى طلب رمز جديد', en: 'Invalid verification code — please request a new code' };
        } else if (apiErr?.status === 404) {
          message = { ar: 'الحساب غير موجود', en: 'Account not found' };
        } else if (apiErr?.status && apiErr?.status >= 500) {
          message = { ar: 'خطأ في الخادم — يرجى المحاولة لاحقاً', en: 'Server error — please try again later' };
        } else {
          message = apiErrorMessage(cause, { ar: 'تعذر تحديث كلمة المرور.', en: 'Could not update the password.' });
        }
        setError(message);
      })
      .finally(() => setPending(false));
  };
  return (
    <AuthShell>
      <h1 className="text-xl font-extrabold">{t('استعادة كلمة المرور', 'Reset your password')}</h1>
      {step === 1 && (
        <div>
          <label className="mt-5 block text-sm font-bold">
            رقم الجوال
            <input
              className="input-field mt-1.5 w-full"
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={event => setPhone(event.target.value.replace(/[^\d+]/g, ''))}
              placeholder="05XXXXXXXX"
            />
            {phone.length > 0 && !phoneValid(phone) && (
              <p className="mt-1 text-xs text-danger-ink">
                يرجى إدخال رقم جوال فلسطيني صالح يبدأ بـ 059 أو 056
              </p>
            )}
          </label>
          <ErrorBanner error={error} />
          <button
            type="button"
            onClick={sendCode}
            disabled={!phoneValid(phone) || pending}
            className="btn-primary mt-5 w-full justify-center"
          >
            {pending && <Loader2 className="animate-spin" size={18} />}إرسال رمز التحقق
          </button>
        </div>
      )}
      {step === 2 && (
        <div>
          <p className="mt-5 text-sm text-ink-muted">
            أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى <span dir="ltr">{phone}</span>.
          </p>
          <div className="mt-5">
            <OtpPinInput
              length={6}
              value={code}
              onChange={setCode}
              state="idle"
              autoFocus
              label="رمز التحقق"
            />
          </div>
          <ErrorBanner error={error} />
          <button
            type="button"
            onClick={() => setStep(3)}
            disabled={code.length !== 6}
            className="btn-primary mt-5 w-full justify-center"
          >
            متابعة
          </button>
          <button
            type="button"
            onClick={sendCode}
            disabled={resendIn > 0 || pending}
            className="mt-4 w-full text-sm font-bold text-brand"
          >
            {resendIn ? `${t('إعادة الإرسال خلال', 'Resend in')} ${resendIn}${t('ث', 's')}` : t('إعادة إرسال الرمز', 'Resend code')}
          </button>
        </div>
      )}
      {step === 3 && (
        <div>
          <PasswordInput
            label="كلمة المرور الجديدة"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <PasswordInput
            label="تأكيد كلمة المرور الجديدة"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          <ErrorBanner error={error} />
          <button
            type="button"
            onClick={finish}
            disabled={!passwordStrong(password) || password !== confirm || pending}
            className="btn-primary mt-5 w-full justify-center"
          >
            {pending && <Loader2 className="animate-spin" size={18} />}حفظ كلمة المرور
          </button>
        </div>
      )}
      <p className="mt-5 text-center text-sm">
        <Link to="/login" className="font-bold text-brand">
          العودة لتسجيل الدخول
        </Link>
      </p>
    </AuthShell>
  );
}
