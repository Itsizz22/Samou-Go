import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2, LockKeyhole, ShoppingCart } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import {
  ApiError,
  firebaseRegister,
  requestOtp,
  resetPassword,
  setSessionPersistence,
  useAuth,
} from '@/hooks/useApi';
import { OtpPinInput } from '@/components/OtpPinInput';
import { normalizePhone, isValidPalestinianMobile, toE164 } from '@/lib/phone';
import { roleHomePath } from '@/lib/roles';
import { auth as firebaseAuth } from '@/lib/firebase';

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
    case 'auth/code-expired':
      return 'انتهت صلاحية الرمز — اطلب رمزاً جديداً / Code expired — request a new one';
    case 'auth/too-many-requests':
      return 'طلبات كثيرة جداً — انتظر قليلاً / Too many attempts — slow down';
    case 'auth/quota-exceeded':
      return 'تجاوز حد الرسائل اليومي — حاول لاحقاً / Daily SMS quota reached — try later';
    case 'auth/network-request-failed':
      return 'تعذر الاتصال بالشبكة / Network error — check your connection';
    case 'auth/missing-recaptcha-token':
      return 'تعذّر التحقق من أنك لست روبوتاً — أعد المحاولة / reCAPTCHA failed — try again';
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
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (!resendIn) return;
    const timer = window.setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);
  // Tear the reCAPTCHA widget down with the screen — a widget left behind
  // breaks the next visitor's `signInWithPhoneNumber` call on the same div.
  useEffect(
    () => () => {
      try {
        window.recaptchaVerifier?.clear();
      } catch {
        // Already cleared — nothing to do.
      }
    },
    []
  );
  const valid = name.trim().length >= 2 && phoneValid(phone) && accepted;
  if (auth.ready && auth.user) return <Navigate to={roleHomePath(auth.user.role)} replace />;
  const normalizedPhone = normalizePhone(phone);
  const sendCode = () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      window.recaptchaVerifier?.clear();
    } catch {
      // Fresh widget below — the old one is gone.
    }
    window.recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', {
      size: 'invisible',
    });
    signInWithPhoneNumber(firebaseAuth, toE164(normalizedPhone), window.recaptchaVerifier)
      .then(result => {
        setConfirmation(result);
        setStep('otp');
        setResendIn(30);
      })
      .catch((cause: unknown) =>
        setError(firebaseErrorMessage(cause, 'تعذر إرسال رمز التحقق — حاول مجدداً.'))
      )
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
      .then(() => navigate('/', { replace: true }))
      .catch((cause: unknown) =>
        setError(firebaseErrorMessage(cause, 'رمز التحقق غير صحيح.'))
      )
      .finally(() => setPending(false));
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
      <div id="recaptcha-container" aria-hidden="true" className="hidden" />
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
              onChange={event => setPhone(event.target.value)}
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
