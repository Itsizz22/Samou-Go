import loginBrand from '@/assets/login-brand.jpeg';
import { AuthSupportContact } from '@/components/AuthSupportContact';
import { useState } from 'react';
import { CheckCheck, Eye, EyeOff, KeyRound, Loader2, Smartphone } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '@samou-go/ui';
import { setSessionPersistence, useAuth, useToast } from '@/hooks/useApi';
import { isValidPalestinianMobile, normalizePhone } from '@/lib/phone';
import { roleHomePath } from '@/lib/roles';

/** Figma 4:7: login, using the shared session and role-navigation flows. */
export function LoginScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { t, language } = useLanguage();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [remember, setRemember] = useState(true);
  const invalidPhone = phone.length > 0 && !isValidPalestinianMobile(phone);
  const valid = isValidPalestinianMobile(phone) && password.length > 0;
  const resetComplete = location.state && typeof location.state === 'object'
    && 'resetComplete' in location.state && location.state.resetComplete === true;

  if (auth.ready && auth.user) return <Navigate to={roleHomePath(auth.user.role)} replace />;

  return (
    <main
      className="customer-login min-h-svh bg-canvas font-sans text-ink"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      aria-labelledby="login-title"
      data-figma-node="4:7"
    >
      <div className="customer-login__screen mx-auto w-full max-w-md">
        <header className="overflow-hidden bg-white">
          <img src={loginBrand} width={1600} height={1066} alt="Samou Quick — من مكانك إلى بابك، كل ما تحتاجه يصلك بسرعة وسهولة" fetchPriority="high" className="block h-auto w-full" />
        </header>

        <div className="customer-login__content flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-1.5 text-start">
            <h1 id="login-title" className="font-sans text-2xl font-bold leading-8">
              {t('تسجيل الدخول', 'Sign in')}
            </h1>
            <p className="text-sm leading-5 text-ink-muted">
              {t('أهلاً بك مجدداً! يرجى إدخال بياناتك للمتابعة', 'Welcome back! Enter your details to continue.')}
            </p>
          </div>

          {resetComplete && (
            <p role="status" className="rounded-xl bg-brand-surface px-3 py-2 text-sm text-brand-deep">
              {t('تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.', 'Password updated. You can sign in now.')}
            </p>
          )}

          <form
            className="flex flex-col gap-6"
            noValidate
            aria-busy={auth.pending}
            onSubmit={event => {
              event.preventDefault();
              if (!valid || auth.pending || !auth.ready) return;
              setSessionPersistence(remember);
              void auth.signIn({ phone: normalizePhone(phone), password }).then(user => {
                if (!user) return;
                if (user.role === 'ADMIN') {
                  toast.info(
                    'لوحة التحكم الرئيسية للإدارة متوفرة عبر متصفح الويب',
                    'The main Admin dashboard is available via the Web browser',
                    { duration: 4500 },
                  );
                }
                navigate(roleHomePath(user.role), { replace: true });
              });
            }}
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="login-phone" className="text-sm font-semibold leading-5">
                {t('رقم الجوال', 'Mobile number')}
              </label>
              <div className="customer-login__field flex h-13 items-center gap-3 rounded-field border-line bg-surface px-4" dir="ltr">
                <Smartphone size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />
                <input
                  id="login-phone"
                  name="phone"
                  type="tel"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  disabled={auth.pending}
                  value={phone}
                  onChange={event => setPhone(event.target.value.replace(/[^\d+]/g, ''))}
                  placeholder="05XXXXXXXX"
                  aria-invalid={invalidPhone}
                  aria-describedby={invalidPhone ? 'login-phone-error' : undefined}
                  className="customer-login__input h-full min-w-0 flex-1 bg-transparent font-sans text-base text-end text-ink outline-none placeholder:text-ink-muted"
                />
              </div>
              {invalidPhone && (
                <p id="login-phone-error" className="text-xs leading-5 text-danger-ink">
                  {t('يرجى إدخال رقم جوال صالح يبدأ بـ 05 أو بالمقدمة 970 أو 972', 'Enter a valid Palestinian mobile number starting with 059 or 056.')}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="login-password" className="text-sm font-semibold leading-5">
                {t('كلمة المرور', 'Password')}
              </label>
              <div className="customer-login__field flex h-13 items-center gap-3 rounded-field border-line bg-surface ps-4 pe-1" dir="ltr">
                <KeyRound size={20} className="shrink-0 text-ink-muted" aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type={passwordVisible ? 'text' : 'password'}
                  dir="ltr"
                  autoComplete="current-password"
                  required
                  disabled={auth.pending}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="customer-login__input h-full min-w-0 flex-1 bg-transparent font-sans text-base text-end text-ink outline-none placeholder:text-ink-subtle"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible(visible => !visible)}
                  aria-label={t(passwordVisible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور', passwordVisible ? 'Hide password' : 'Show password')}
                  aria-pressed={passwordVisible}
                  aria-controls="login-password"
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {passwordVisible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div className="-my-3 flex min-h-11 flex-wrap items-center justify-between gap-x-3 text-xs font-medium">
              <Link to="/forgot-password" className="inline-flex min-h-11 items-center rounded text-brand hover:text-brand-dark focus-visible:ring-2 focus-visible:ring-brand">
                {t('نسيت كلمة المرور؟', 'Forgot password?')}
              </Link>
              <label className="relative flex min-h-11 cursor-pointer items-center gap-2 text-ink-muted">
                <span>{t('تذكرني', 'Remember me')}</span>
                <input
                  type="checkbox"
                  name="remember"
                  checked={remember}
                  disabled={auth.pending}
                  onChange={event => setRemember(event.target.checked)}
                  className="peer absolute inset-0 size-full cursor-pointer opacity-0"
                />
                <span className="customer-login__checkbox pointer-events-none flex size-5 items-center justify-center border-line bg-surface peer-checked:border-brand peer-checked:bg-brand-surface peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2" aria-hidden="true">
                  {remember && <CheckCheck size={12} className="text-brand" />}
                </span>
              </label>
            </div>

            {auth.error && (
              <p role="alert" className="rounded-xl bg-danger-tint px-3 py-2 text-sm leading-5 text-danger-ink">
                {t(auth.error.message, auth.error.localizedMessage)}
              </p>
            )}

            <button
              type="submit"
              disabled={!valid || auth.pending || !auth.ready}
              className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-base font-bold text-white transition-colors hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:hover:bg-brand"
            >
              {auth.pending && <Loader2 size={20} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {auth.pending ? t('جارٍ تسجيل الدخول…', 'Signing in…') : t('تسجيل الدخول', 'Sign in')}
            </button>
          </form>
          <AuthSupportContact />

          <p className="-my-1 flex min-h-11 flex-wrap items-center justify-center gap-x-1.5 text-sm leading-5 text-ink-muted">
            <span>{t('ليس لديك حساب؟', 'Don’t have an account?')}</span>
            <Link to="/register" className="inline-flex min-h-11 items-center rounded font-bold text-brand hover:text-brand-dark focus-visible:ring-2 focus-visible:ring-brand">
              {t('أنشئ حساباً جديداً', 'Create an account')}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
