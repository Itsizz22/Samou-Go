import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Eye, EyeOff, Loader2, LockKeyhole, MapPin, ShoppingCart } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type UserCredential,
} from 'firebase/auth';
import {
  ApiError,
  firebaseRegister,
  requestOtp,
  resetPassword,
  setSessionPersistence,
  useAuth,
  useToast,
} from '@/hooks/useApi';
import { OtpPinInput } from '@/components/OtpPinInput';
import { normalizePhone, isValidPalestinianMobile, toE164 } from '@/lib/phone';
import { roleHomePath } from '@/lib/roles';
import { auth as firebaseAuth, isMockAuth, MOCK_FIREBASE_ID_TOKEN } from '@/lib/firebase';
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

/**
 * Turns any API failure into a banner sentence. Field-level validation
 * messages (422 `details`) are shown verbatim — a malformed phone says so
 * instead of hiding behind the generic "Something went wrong".
 */
function apiErrorMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof ApiError)) return fallback;
  const fieldMessages = cause.details.map(detail => detail.message).filter(Boolean);
  return fieldMessages.length > 0 ? fieldMessages.join(' · ') : cause.message;
}

/**
 * Firebase phone-auth failures carry SDK error codes (`auth/...`) instead of
 * HTTP envelopes — map the ones a Palestinian user can actually hit to a
 * bilingual sentence, and fall back for anything unexpected.
 */
function firebaseErrorMessage(cause: unknown, fallback: string): string {
  const code = (cause as { code?: string } | null)?.code;
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'رقم الجوال غير صالح / Invalid phone number';
    case 'auth/invalid-verification-code':
      return 'رمز التحقق غير صحيح / Invalid verification code';
    case 'auth/missing-verification-code':
      return 'أدخل رمز التحقق المكوّن من 6 أرقام / Enter the 6-digit verification code';
    case 'auth/code-expired':
      return 'انتهت صلاحية الرمز — اطلب رمزاً جديداً / Code expired — request a new one';
    case 'auth/too-many-requests':
      return 'طلبات كثيرة جداً — انتظر قليلاً / Too many attempts — slow down';
    case 'auth/quota-exceeded':
      return 'تجاوز حد الرسائل اليومي — حاول لاحقاً / Daily SMS quota reached — try later';
    case 'auth/network-request-failed':
      return 'تعذر الاتصال بالشبكة / Network error — check your connection';
    case 'auth/argument-error':
      return 'تعذّر تحميل التحقق الأمني — أعد المحاولة / Security check failed to load — retry';
    case 'auth/captcha-check-failed':
      return 'تعذّر التحقق من أنك لست روبوتاً — أعد المحاولة / reCAPTCHA failed — try again';
    case 'auth/invalid-recaptcha-token':
    case 'auth/missing-recaptcha-token':
      return 'تعذّر التحقق من أنك لست روبوتاً — أعد المحاولة / reCAPTCHA failed — try again';
    case 'auth/operation-not-allowed':
      return 'التحقق عبر الجوال غير مفعّل — تواصل مع الدعم / Phone sign-in is not enabled';
    case 'auth/unauthorized-domain':
      return 'هذا النطاق غير مصرّح في Firebase — تواصل مع الدعم / Domain not authorized for Firebase — contact support';
    case 'auth/internal-error':
      return 'خطأ داخلي — أعد المحاولة / Internal error — try again';
    default:
      return fallback;
  }
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
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

function ErrorBanner({ error }: { error: string | null }) {
  return error ? (
    <p
      role="alert"
      className="mt-4 rounded-xl bg-danger-tint px-3 py-2 text-xs font-semibold text-danger-ink"
    >
      {error}
    </p>
  ) : null;
}

export function LoginScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);

  if (auth.ready && auth.user) return <Navigate to={roleHomePath(auth.user.role)} replace />;
  const valid = phoneValid(phone) && password.length > 0;
  return (
    <AuthShell>
      <h1 className="text-xl font-extrabold">تسجيل الدخول</h1>
      <p className="mt-1 text-sm text-ink-muted" dir="ltr">
        Sign in to your account
      </p>
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
            onChange={event => setPhone(event.target.value)}
            placeholder="05XXXXXXXX"
            aria-invalid={phone.length > 0 && !phoneValid(phone)}
          />
        </label>
        {phone.length > 0 && !phoneValid(phone) && (
          <p className="mt-1 text-xs text-danger-ink">أدخل رقماً فلسطينياً صحيحاً.</p>
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
        <ErrorBanner error={auth.error?.message ?? null} />
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
      <p className="mt-5 text-center text-sm text-ink-muted">
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
  const [step, setStep] = useState<'form' | 'otp' | 'location'>('form');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!resendIn) return;
    const timer = window.setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);
  // ONE invisible reCAPTCHA widget for the whole screen lifetime, created on
  // mount against the hidden container. Recreating a verifier on the same
  // element per submit (or clearing mid-flight) races the widget render and
  // throws `auth/argument-error` / `auth/captcha-check-failed` — reuse the
  // same instance for every send/resend and tear it down only on unmount.
  useEffect(() => {
    if (isMockAuth) return;
    // The widget must be constructed against a real DOM node. A ref (not a
    // string id lookup) guarantees the node from this very render — a stale
    // or missing `#recaptcha-container` would otherwise throw uncaught here.
    const container = containerRef.current;
    if (!container) {
      console.error('[firebase] #recaptcha-container not in the DOM — reCAPTCHA disabled');
      return;
    }
    const verifier = new RecaptchaVerifier(firebaseAuth, container, {
      size: 'invisible',
    });
    verifierRef.current = verifier;
    window.recaptchaVerifier = verifier;
    return () => {
      try {
        verifier.clear();
      } catch {
        // Never rendered — nothing to tear down.
      }
      window.recaptchaVerifier = undefined;
      verifierRef.current = null;
    };
  }, []);
  const valid = name.trim().length >= 2 && phoneValid(phone) && accepted;
  const [locationText, setLocationText] = useState('');
  const [locationTag, setLocationTag] = useState<AddressTag>('home');
  const [geoPending, setGeoPending] = useState(false);
  const [geoApplied, setGeoApplied] = useState(false);
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  if (auth.ready && auth.user) return <Navigate to={roleHomePath(auth.user.role)} replace />;
  const normalizedPhone = normalizePhone(phone);
  /**
   * Widget-init failures mean the invisible reCAPTCHA iframe never finished
   * booting (stale widget, interrupted load, domain re-check). Tear the old
   * verifier down and build a fresh one so the user's retry starts with a
   * clean widget instead of a half-initialised one.
   */
  const rebuildVerifier = () => {
    const old = verifierRef.current;
    if (old) {
      try {
        old.clear();
      } catch {
        // Widget never rendered — nothing to tear down.
      }
    }
    verifierRef.current = null;
    window.recaptchaVerifier = undefined;
    const container = containerRef.current;
    if (!container) {
      console.error('[firebase] #recaptcha-container missing during verifier rebuild');
      return;
    }
    const fresh = new RecaptchaVerifier(firebaseAuth, container, {
      size: 'invisible',
    });
    verifierRef.current = fresh;
    window.recaptchaVerifier = fresh;
  };
  const isWidgetFailure = (code: string | undefined) =>
    code === 'auth/argument-error' ||
    code === 'auth/captcha-check-failed' ||
    code === 'auth/invalid-recaptcha-token' ||
    code === 'auth/missing-recaptcha-token' ||
    code === 'auth/internal-error';
  const sendCode = () => {
    if (pending) return;
    // Mock-auth mode (VITE_USE_MOCK_AUTH=true): skip Firebase Phone Auth and
    // the reCAPTCHA widget entirely. Any 6-digit code is accepted; the finish
    // step presents the API's mock ID token instead of a real Firebase one.
    if (isMockAuth) {
      setPending(true);
      setError(null);
      window.setTimeout(() => {
        setConfirmation({
          verificationId: `mock-${Date.now()}`,
          confirm: async () =>
            ({
              user: { getIdToken: async () => MOCK_FIREBASE_ID_TOKEN },
            }) as unknown as UserCredential,
        });
        setStep('otp');
        setResendIn(30);
        setPending(false);
        toast.info(
          'وضع الاختبار: أدخل أي رمز من 6 أرقام',
          'Mock auth — any 6-digit code is accepted'
        );
      }, 400);
      return;
    }
    const verifier = verifierRef.current;
    if (!verifier) return;
    setPending(true);
    setError(null);
    signInWithPhoneNumber(firebaseAuth, toE164(normalizedPhone), verifier)
      .then(result => {
        setConfirmation(result);
        setStep('otp');
        setResendIn(30);
        toast.success('تم إرسال رمز التحقق', 'OTP sent — check your SMS inbox');
      })
      .catch((cause: unknown) => {
        const message = firebaseErrorMessage(cause, 'تعذر إرسال رمز التحقق — حاول مجدداً.');
        setError(message);
        const [ar, en] = message.split(' / ');
        toast.error(ar, en ?? 'Try again');
        // A half-initialised widget poisons every later attempt — rebuild it
        // so the next send/resend gets a fresh reCAPTCHA.
        if (isWidgetFailure((cause as { code?: string } | null)?.code)) rebuildVerifier();
      })
      .finally(() => setPending(false));
  };
  const finish = () => {
    if (code.length !== 6 || pending || !confirmation) return;
    setPending(true);
    setError(null);
    setSessionPersistence(true);
    confirmation
      .confirm(code)
      .then(async firebaseUser => {
        const idToken = await firebaseUser.user.getIdToken();
        return firebaseRegister({ idToken, name: name.trim(), phone: normalizedPhone });
      })
      // Account is live — collect a delivery address before dropping the user
      // into the app, so the first checkout starts with a prefilled location.
      .then(() => {
        toast.success('تم إنشاء حسابك — أهلاً بك!', 'Account created — welcome!');
        setStep('location');
      })
      .catch((cause: unknown) => {
        const message = firebaseErrorMessage(cause, 'رمز التحقق غير صحيح.');
        setError(message);
        // An invalid or expired code must not stick in the pin input — clear
        // it so the retry starts from a clean field (and the submit button
        // un-disables only once all 6 digits are re-entered).
        const codeErr = (cause as { code?: string } | null)?.code;
        if (codeErr === 'auth/invalid-verification-code' || codeErr === 'auth/code-expired') {
          setCode('');
        }
      })
      .finally(() => setPending(false));
  };

  /* ---- Location onboarding (step 3) -------------------------------------- */

  const saveLocationAndEnter = () => {
    if (pending) return;
    setError(null);
    const text = locationText.trim();
    if (!text) {
      // Skipping is allowed — the address book is a convenience, not a wall.
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
        setError('تعذّر تحديد موقعك — اكتب عنوانك يدوياً / Location unavailable — type your address');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  const resend = () => {
    if (pending || resendIn > 0) return;
    sendCode();
  };
  return (
    <AuthShell>
      <h1 className="text-xl font-extrabold">إنشاء حساب</h1>
      <p className="mt-1 text-sm text-ink-muted" dir="ltr">
        Create your account
      </p>
      {/* Invisible reCAPTCHA host — kept in the DOM but pushed off-screen.
          `display:none` breaks the widget render in some browsers, so hide it
          geometrically instead. */}
      <div
        id="recaptcha-container"
        ref={containerRef}
        aria-hidden="true"
        className="pointer-events-none fixed -z-10 start-[-9999px] top-[-9999px] h-px w-px opacity-0"
      />
      {step === 'form' && (
        <form
          noValidate
          onSubmit={event => {
            event.preventDefault();
            if (!valid) return;
            sendCode();
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
      {step === 'otp' && (
        <div>
          <p className="mt-5 text-sm text-ink-muted">
            أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى <span dir="ltr">{normalizedPhone}</span>{' '}
            لتفعيل حسابك.
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
            onClick={finish}
            disabled={code.length !== 6 || pending}
            className="btn-primary mt-5 w-full justify-center"
          >
            {pending && <Loader2 className="animate-spin" size={18} />}تفعيل الحساب
          </button>
          <button
            type="button"
            onClick={resend}
            disabled={resendIn > 0 || pending}
            className="mt-4 w-full text-sm font-bold text-brand"
          >
            {resendIn ? `إعادة الإرسال خلال ${resendIn}ث` : 'إعادة إرسال الرمز'}
          </button>
        </div>
      )}
      {step === 'location' && (
        <div>
          <div className="mt-5 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-brand">
              <MapPin size={20} />
            </span>
            <div>
              <h2 className="text-sm font-extrabold">أين تسكن؟</h2>
              <p className="text-[11px] text-ink-muted" dir="ltr">
                Where should we deliver?
              </p>
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
                {ADDRESS_TAG_META[tag].ar}{' '}
                <span dir="ltr" className="font-medium">
                  {ADDRESS_TAG_META[tag].en}
                </span>
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
              <>تم تحديد موقعك{' '}
              <span dir="ltr" className="font-medium">Location captured</span></>
            ) : (
              <>
                شارك موقعي الحالي{' '}
                <span dir="ltr" className="font-medium">Use my location</span>
              </>
            )}
          </button>
          <ErrorBanner error={error} />
          <button
            type="button"
            onClick={saveLocationAndEnter}
            className="btn-primary mt-5 w-full justify-center"
          >
            حفظ والمتابعة <span dir="ltr" className="font-medium">Save &amp; continue</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="mt-3 w-full text-sm font-bold text-ink-muted"
          >
            تخطي الآن <span dir="ltr" className="font-medium">Skip for now</span>
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
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
        setResendIn(30);
      })
      .catch((cause: unknown) =>
        setError(apiErrorMessage(cause, 'تعذر إرسال الرمز.'))
      )
      .finally(() => setPending(false));
  };
  const finish = () => {
    if (code.length !== 6 || !passwordStrong(password) || password !== confirm || pending) return;
    setPending(true);
    setError(null);
    void resetPassword({ phone: normalizePhone(phone), code, password })
      .then(() => navigate('/login', { replace: true, state: { resetComplete: true } }))
      .catch((cause: unknown) =>
        setError(apiErrorMessage(cause, 'تعذر تحديث كلمة المرور.'))
      )
      .finally(() => setPending(false));
  };
  return (
    <AuthShell>
      <h1 className="text-xl font-extrabold">استعادة كلمة المرور</h1>
      <p className="mt-1 text-sm text-ink-muted" dir="ltr">
        Reset your password
      </p>
      {step === 1 && (
        <div>
          <label className="mt-5 block text-sm font-bold">
            رقم الجوال
            <input
              className="input-field mt-1.5 w-full"
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={event => setPhone(event.target.value)}
              placeholder="05XXXXXXXX"
            />
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
            {resendIn ? `إعادة الإرسال خلال ${resendIn}ث` : 'إعادة إرسال الرمز'}
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
