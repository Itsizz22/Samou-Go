import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, deleteMyAccount } from '@samou-go/api-client';
import { useAuth } from '@/hooks/useApi';
import { useCart } from '@/components/CartProvider';
import { useLanguage } from '@samou-go/ui';
import { writeSavedAddresses } from '@/lib/address-book';

export function DeleteAccountScreen({ completed = false }: { completed?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const cart = useCart();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function erase() {
    if (busy || !confirmed || !password) return;
    setBusy(true); setError('');
    try {
      await deleteMyAccount(password);
      writeSavedAddresses([], user?.id);
      cart.clear(); setPassword('');
      navigate('/account-deleted', { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('تعذر تأكيد الحذف. تحقق من الاتصال وأعد المحاولة.', 'Deletion could not be confirmed. Check your connection and retry.'));
    } finally { setBusy(false); }
  }
  return <main className="min-h-svh bg-canvas px-5 py-8 text-ink">
    <div className="mx-auto max-w-lg space-y-5">
      <Link className="inline-flex min-h-11 items-center font-bold text-brand-dark" to={user ? '/settings' : '/'}>{t('العودة', 'Back')}</Link>
      <h1 className="text-2xl font-extrabold">{t('حذف الحساب نهائيًا', 'Permanently delete account')}</h1>
      {completed ? <section role="status" className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-xl font-bold">{t('تم حذف حسابك', 'Your account has been deleted')}</h2>
        <p>{t('حُذف حسابك وبياناتك الشخصية وأُلغيت جلساتك على جميع الأجهزة. لا يمكن استعادة الحساب.', 'Your account and personal data were deleted and all device sessions revoked. This cannot be undone.')}</p>
        <Link className="btn-primary inline-flex min-h-11 items-center" to="/">{t('العودة للرئيسية', 'Return home')}</Link>
      </section> : !user ? <p>{t('سجّل الدخول إلى الحساب الذي تريد حذفه.', 'Sign in to the account you want to delete.')} <Link className="text-brand-dark underline" to="/login">{t('تسجيل الدخول', 'Sign in')}</Link></p> :
      <form onSubmit={event => { event.preventDefault(); void erase(); }} className="space-y-5 rounded-2xl border border-line bg-surface p-5">
        <p className="font-bold">{user.name} <span dir="ltr">{user.phone}</span></p>
        <p>{t('سيُحذف حسابك واسمك ورقمك وصورتك وموقعك والمفضلة والمحادثات وطلبات الدعم، وتُلغى جميع جلساتك. الحذف نهائي ولا يحتاج إلى التواصل مع الدعم.', 'Your account, name, phone, avatar, location, favorites, chats and support requests will be deleted. All sessions will be revoked. Deletion is permanent and does not require contacting support.')}</p>
        <p className="text-sm text-ink-muted">{t('تبقى مبالغ وسجلات المعاملات دون ربطها بحسابك أو بيانات التواصل لأغراض المحاسبة. إذا كنت تدير متجرًا فسيُغلق عرضه. أكمل أو ألغِ الطلبات الجارية قبل الحذف.', 'Transaction amounts and records remain without your account or contact details for accounting. Any store you manage will be closed. Complete or cancel active orders before deletion.')}</p>
        <label className="block space-y-2"><span className="font-bold">{t('كلمة المرور الحالية', 'Current password')}</span>
          <input required disabled={busy} type="password" autoComplete="current-password" maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className="min-h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base" />
        </label>
        <label className="flex items-start gap-3"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0" /><span>{t('أفهم أن الحذف نهائي وأؤكد حذف هذا الحساب وبياناته.', 'I understand deletion is permanent and confirm deleting this account and its data.')}</span></label>
        {error && <p role="alert" className="font-bold">{error}</p>}
        <button type="submit" disabled={busy || !confirmed || !password} className="btn-primary min-h-12 w-full justify-center disabled:opacity-50">{busy ? t('جارٍ حذف الحساب…', 'Deleting account…') : t('حذف حسابي نهائيًا', 'Permanently delete my account')}</button>
        <Link className="flex min-h-11 items-center justify-center" to="/settings">{t('إلغاء والاحتفاظ بحسابي', 'Cancel and keep my account')}</Link>
      </form>}
    </div>
  </main>;
}
