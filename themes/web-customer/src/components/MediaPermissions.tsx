import { useRef, useState } from 'react';
import { FileImage, Mic, Loader2 } from 'lucide-react';
import { useLanguage } from '@samou-go/ui';

/** Access is requested through the system, never represented by a saved app toggle. */
export function MediaPermissions() {
  const { t } = useLanguage();
  const picker = useRef<HTMLInputElement>(null);
  const requesting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function requestMicrophone() {
    if (requesting.current) return;
    requesting.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage(t('الميكروفون غير متاح في هذا المتصفح. افتح التطبيق أو استخدم متصفحًا يدعم التسجيل.', 'Microphone access is unavailable in this browser. Open the app or use a supported browser.'));
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMessage(t('تم السماح بالميكروفون لهذه التجربة. أوقفنا الميكروفون دون تسجيل صوت.', 'Microphone access succeeded. The microphone was stopped without recording.'));
    } catch {
      setMessage(t('تعذّر الوصول للميكروفون. اسمح به من أذونات التطبيق أو إعدادات الموقع في المتصفح، ثم حاول مجددًا.', 'Microphone access failed. Allow it in app permissions or browser site settings, then retry.'));
    } finally {
      requesting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4" aria-labelledby="media-permissions-title">
      <h2 id="media-permissions-title" className="font-bold text-ink">{t('أذونات الصور والميكروفون', 'Photos and microphone')}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t('اختر الصور أو الملفات التي تسمح بالوصول إليها من نافذة النظام. لا نطلب الوصول لكل ملفات هاتفك.', 'Choose the photos or files to allow through the system picker. Access to all your files is not required.')}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => picker.current?.click()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-bold text-brand transition active:scale-95">
          <FileImage size={18} />{t('اختيار ملف للسماح بالوصول', 'Choose a file to allow access')}
        </button>
        <button type="button" disabled={busy} onClick={() => void requestMicrophone()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-bold text-white transition active:scale-95 disabled:opacity-60">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}{t('طلب إذن الميكروفون', 'Request microphone access')}
        </button>
      </div>
      <input ref={picker} type="file" className="hidden" onChange={event => {
        if (event.target.files?.length) setMessage(t('تم اختيار الملف والسماح بالوصول إليه لهذه التجربة فقط. لم يتم رفعه أو حفظه.', 'File access succeeded for this check only. Nothing was uploaded or saved.'));
        event.target.value = '';
      }} />
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">{t('طلب إذن الميكروفون لا يسجّل أو يرسل صوتًا. قد يطلب النظام الإذن مجددًا عند التسجيل.', 'Requesting microphone access does not record or send audio. The system may ask again when you record.')}</p>
      <p role="status" className="mt-2 text-sm leading-relaxed text-ink-muted">{message}</p>
    </section>
  );
}
