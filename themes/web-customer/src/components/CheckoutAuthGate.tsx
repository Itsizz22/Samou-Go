import { useEffect, useRef, useState } from 'react';
import { register, setToken, setRefreshToken } from '@samou-go/api-client';
import { useAuth } from '@/hooks/useApi';
import { normalizePhone, isValidPalestinianMobile } from '@/lib/phone';
import { useAndroidOverlayBack } from '@/lib/androidBack';
export function CheckoutAuthGate({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const auth = useAuth();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('input')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const [login, setLogin] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useAndroidOverlayBack(true, onClose);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (
      !isValidPalestinianMobile(phone) ||
      password.length < 8 ||
      (!login && name.trim().length < 2)
    ) {
      setError('تحقق من الاسم ورقم الهاتف وكلمة المرور (8 أحرف على الأقل)');
      return;
    }
    setPending(true);
    setError('');
    try {
      if (login) {
        const user = await auth.signIn({ phone: normalizePhone(phone), password });
        if (!user) {
          setError('تعذر تسجيل الدخول، تحقق من بياناتك');
          return;
        }
      } else {
        const result = await register({
          name: name.trim(),
          phone: normalizePhone(phone),
          password,
        });
        setToken(result.accessToken);
        setRefreshToken(result.refreshToken ?? null);
        await auth.refresh();
      }
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إكمال التسجيل');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" dir="rtl">
      <section
        ref={panel}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
          if (event.key !== 'Tab') return;
          const nodes = panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled)'
          );
          const first = nodes?.[0];
          const last = nodes?.[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-auth-title"
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-6 text-ink shadow-card"
      >
        <button onClick={onClose} aria-label="إغلاق" className="min-h-11 min-w-11">
          ✕
        </button>
        <h2 id="checkout-auth-title" className="text-xl font-extrabold">
          أنشئ حسابك لإتمام الطلب 🛒
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          خطوة سريعة لمرة واحدة لتتبع طلبك وحفظ عنوانك بدقة
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {!login && (
            <label className="block">
              الاسم الكامل
              <input
                className="input-field mt-1 min-h-11 w-full"
                autoComplete="name"
                value={name}
                onChange={event => setName(event.target.value)}
                required
              />
            </label>
          )}
          <label className="block">
            رقم الهاتف
            <input
              className="input-field mt-1 min-h-11 w-full"
              dir="ltr"
              type="tel"
              autoComplete="tel"
              placeholder="+970 / +972"
              value={phone}
              onChange={event => setPhone(event.target.value)}
              required
            />
          </label>
          <label className="block">
            كلمة المرور
            <input
              className="input-field mt-1 min-h-11 w-full"
              type="password"
              autoComplete={login ? 'current-password' : 'new-password'}
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger-ink">
              {error}
            </p>
          )}
          <button disabled={pending} className="btn-primary min-h-11 w-full">
            {pending
              ? 'جارٍ المتابعة...'
              : login
                ? 'تسجيل الدخول والمتابعة'
                : 'إنشاء حساب والمتابعة'}
          </button>
          <button
            type="button"
            className="min-h-11 w-full text-brand"
            onClick={() => {
              setLogin(!login);
              setError('');
            }}
          >
            {login ? 'إنشاء حساب جديد' : 'لدي حساب بالفعل'}
          </button>
        </form>
      </section>
    </div>
  );
}
