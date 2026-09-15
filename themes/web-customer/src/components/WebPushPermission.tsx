import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { enableWebPush, supportsWebPush, webPushConfigured } from '../lib/webPush';

export function WebPushPermission() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (Capacitor.isNativePlatform()) return null;
  return <div className="mt-3 border-t border-line pt-3">
    <p className="text-sm text-ink-muted">على iPhone أضف التطبيق إلى الشاشة الرئيسية أولًا، ثم افتحه لتفعيل إشعارات الطلبات.</p>
    <button type="button" disabled={busy || !webPushConfigured || !supportsWebPush()} className="mt-2 min-h-11 rounded-xl bg-brand px-4 text-white disabled:opacity-50" onClick={async () => {
      setBusy(true);
      try { setMessage(await enableWebPush() ? 'تم تفعيل إشعارات هذا الجهاز' : 'تعذر التفعيل. تحقق من إذن الإشعارات والاتصال ثم أعد المحاولة.'); }
      catch { setMessage('تعذر تفعيل الإشعارات؛ أعد المحاولة.'); }
      finally { setBusy(false); }
    }}>{busy ? 'جارٍ التفعيل…' : 'تفعيل إشعارات هذا الجهاز'}</button>
    {!webPushConfigured && <p className="mt-2 text-xs text-ink-muted">إشعارات المتصفح غير متاحة حاليًا.</p>}
    <p role="status" className="mt-2 text-sm">{message}</p>
  </div>;
}
