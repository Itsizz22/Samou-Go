import type { Auth } from './useAuth';
import { getToken, getRefreshToken } from './api';
export function needsSessionRecovery(auth: Auth): boolean {
  return auth.ready && !auth.user && !!auth.error && !auth.error.isAuthError && !!(getToken() || getRefreshToken());
}
export function SessionRecovery({ auth }: { auth: Auth }) {
  return <main dir="rtl" className="mx-auto max-w-md space-y-4 p-6" role="alert">
    <h1 className="text-xl font-bold">تعذر الاتصال بالخادم</h1>
    <p>لم نتمكن من التحقق من جلستك. بيانات الدخول محفوظة؛ أعد المحاولة عند عودة الاتصال.</p>
    <button className="btn-primary" disabled={auth.pending} onClick={() => void auth.refresh()}>{auth.pending ? 'جارٍ الاتصال…' : 'إعادة المحاولة'}</button>
    <button className="ms-3 rounded-xl border border-line p-3" disabled={auth.pending} onClick={auth.signOut}>تسجيل الخروج</button>
  </main>;
}
