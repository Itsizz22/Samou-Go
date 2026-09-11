import { useEffect, useId, useState } from 'react';
import { useLanguage } from '../lib';

function splitNumber(value: string) {
  const digits = value.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/\D/g, '').replace(/^00/, '');
  const country = (digits.startsWith('972') || /^05[0-578]\d{7}$/.test(digits)) ? '972' : '970';
  return { country, local: /^(970|972)/.test(digits) ? digits.slice(3) : digits.replace(/^0/, '') };
}

/** Explicit user choice, not an assertion that WhatsApp has verified ownership. */
export function WhatsAppNumberSettings({ value, fallbackPhone, onSave }: {
  value?: string | null;
  fallbackPhone: string;
  onSave: (number: string | null) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const id = useId();
  const initial = splitNumber(value || fallbackPhone);
  const [country, setCountry] = useState(initial.country);
  const [local, setLocal] = useState(initial.local);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => { const next = splitNumber(value || fallbackPhone); setCountry(next.country); setLocal(next.local); }, [value, fallbackPhone]);
  const save = async () => {
    if (busy) return;
    const digits = splitNumber(local).local;
    if (digits && !/^5\d{8}$/.test(digits)) { setFailed(true); setMessage(t('أدخل رقم جوال صحيحًا من 9 أرقام دون الصفر الأول.', 'Enter 9 mobile digits without the leading zero.')); return; }
    setBusy(true); setMessage(''); setFailed(false);
    try { await onSave(digits ? `+${country}${digits}` : null); setMessage(t('تم حفظ رقم واتساب.', 'WhatsApp number saved.')); }
    catch { setFailed(true); setMessage(t('تعذّر حفظ رقم واتساب. حاول مجددًا.', 'Could not save WhatsApp number. Please retry.')); }
    finally { setBusy(false); }
  };
  return <fieldset disabled={busy} className="my-4 min-w-0 rounded-2xl border border-line bg-surface p-4 text-ink">
    <legend className="px-1 text-sm font-bold">{t('رقم واتساب', 'WhatsApp number')}</legend>
    <p id={`${id}-help`} className="mb-3 text-xs leading-6 text-ink-muted">{t('اختر المقدمة كما تظهر في حسابك على واتساب. هذا الرقم للتواصل فقط ولا يغيّر رقم الدخول أو OTP.', 'Choose the prefix shown in your WhatsApp account. This contact number does not change your login or OTP number.')}</p>
    <div dir="ltr" className="flex min-w-0 gap-2">
      <select aria-label={t('مقدمة رقم واتساب', 'WhatsApp country code')} value={country} onChange={e => { setCountry(e.target.value); setMessage(''); }} className="min-h-11 rounded-xl border border-line bg-canvas px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"><option value="970">+970</option><option value="972">+972</option></select>
      <input type="tel" inputMode="tel" aria-label={t('رقم واتساب دون المقدمة', 'WhatsApp number without country code')} aria-describedby={`${id}-help`} value={local} onChange={e => { const raw = e.target.value; if (/^(\+|00)?97[02]/.test(raw)) { const next=splitNumber(raw); setCountry(next.country); setLocal(next.local); } else setLocal(raw); setMessage(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} placeholder="569123456" className="min-h-11 w-full min-w-0 rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand" />
    </div>
    <p className="mt-2 text-xs leading-5 text-ink-muted">{t('تأكد أنه رقمك؛ لم يتم التحقق من ملكيته عبر واتساب. تركه فارغًا يعيد استخدام رقم التواصل الأساسي.', 'Use your own number; WhatsApp ownership has not been verified. Leave blank to use the primary contact number.')}</p>
    <button type="button" disabled={busy} onClick={() => void save()} className="mt-3 min-h-11 w-full rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ رقم واتساب', 'Save WhatsApp number')}</button>
    {message && <p role={failed ? 'alert' : 'status'} className={`mt-2 text-sm ${failed ? 'text-danger-ink' : 'text-ink-muted'}`}>{message}</p>}
  </fieldset>;
}
