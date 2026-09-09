import { Headphones, MessageCircle } from 'lucide-react';
import { formatWhatsAppLink } from '@samou-go/shared-types';
import { usePlatformSettings } from '@/hooks/useApi';
export function AuthSupportContact() {
  const settings = usePlatformSettings();
  const phone = settings.data?.whatsappSupportNumber;
  return <aside className="mt-5 rounded-2xl border border-line bg-canvas p-4 text-start" dir="rtl">
    <p className="flex items-center gap-2 text-sm font-bold text-ink"><Headphones size={18} className="text-brand" />هل تحتاج مساعدة في الدخول؟</p>
    <p className="mt-2 text-xs leading-6 text-ink-muted">إذا نسيت كلمة المرور أو واجهت مشكلة في التسجيل، تواصل معنا للمساعدة.</p>
    {phone ? <a href={formatWhatsAppLink(phone, 'مرحباً، أحتاج مساعدة في تسجيل الدخول أو استعادة حسابي في سموع كويك.')} target="_blank" rel="noreferrer" className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand px-3 text-sm font-bold text-brand focus-visible:ring-2 focus-visible:ring-brand"><MessageCircle size={18} />تواصل مع الدعم الفني</a> : settings.loading ? <p role="status" className="mt-2 text-xs text-ink-muted">جارٍ تحميل وسيلة التواصل…</p> : <p className="mt-2 text-xs text-ink-muted">{settings.error ? 'تعذّر تحميل رقم الدعم.' : 'لم يُحدَّد رقم الدعم بعد.'}<button type="button" className="ms-2 min-h-11 text-brand underline" onClick={settings.refresh}>إعادة المحاولة</button></p>}
  </aside>;
}
