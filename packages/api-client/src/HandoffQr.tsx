import { useEffect, useRef, useState } from 'react';

export function HandoffQr({ value, title }: { value: string; title: string }) {
  const [image, setImage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setImage(''); setFailed(false);
    void import('qrcode').then(qr => qr.toDataURL(value, { width: 360, margin: 4, errorCorrectionLevel: 'M' }))
      .then(url => { if (live) setImage(url); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [value]);
  return <section className="space-y-2 rounded-2xl border border-line bg-surface p-4 text-center">
    <h3 className="font-bold">{title}</h3>
    {image ? <img src={image} alt={title} className="mx-auto w-full max-w-72 rounded-xl" /> : <p role="status">{failed ? 'تعذر عرض الرمز، أعد فتح الطلب' : 'جارٍ تجهيز الرمز…'}</p>}
    <p className="text-sm text-ink-muted">اعرض الرمز للكابتن عند تسليم الطلب فقط.</p>
  </section>;
}

export function HandoffScanner({ orderId, stage, onScan, onClose }: {
  orderId: string; stage: 'pickup' | 'delivery'; onScan: (token: string) => Promise<void>; onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const submit = useRef(onScan); submit.current = onScan;
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let disposed = false, consumed = false;
    let stream: MediaStream | undefined;
    let controls: { stop: () => void } | undefined;
    const stop = () => { controls?.stop(); stream?.getTracks().forEach(track => track.stop()); };
    const hide = () => { if (document.hidden) { stop(); setError('توقفت الكاميرا عند مغادرة التطبيق. اضغط إعادة المسح.'); } };
    document.addEventListener('visibilitychange', hide);
    setError(''); setPending(false);
    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        if (disposed) return;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (disposed || document.hidden) { stop(); return; }
        if (!video.current) { stop(); return; }
        controls = await new BrowserQRCodeReader().decodeFromStream(stream, video.current, result => {
          if (!result || disposed || consumed || document.hidden) return;
          const token = result.getText();
          if (!token.startsWith(`SAMOU:1:${stage}:${orderId}:`)) { setError('هذا الرمز ليس لمرحلة التسليم الحالية لهذا الطلب.'); return; }
          consumed = true; stop(); setError(''); setPending(true);
          void submit.current(token).catch(reason => {
            if (!disposed) setError(reason instanceof Error ? reason.message : 'تعذر تأكيد التسليم. حاول مجددًا.');
          }).finally(() => { if (!disposed) setPending(false); });
        });
        if (disposed || consumed || document.hidden) stop();
      } catch {
        stop();
        if (!disposed) setError('تعذر تشغيل الكاميرا. اسمح بالوصول إليها من إعدادات التطبيق ثم أعد المسح.');
      }
    })();
    return () => { disposed = true; stop(); document.removeEventListener('visibilitychange', hide); };
  }, [orderId, stage, attempt]);
  return <div role="dialog" aria-modal="true" aria-label="مسح رمز التسليم" dir="rtl" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
    <section className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-5 text-ink">
      <h2 className="text-lg font-bold">{stage === 'pickup' ? 'امسح QR من شاشة المتجر' : 'امسح QR من شاشة الزبون'}</h2>
      <video ref={video} autoPlay muted playsInline className="aspect-square w-full rounded-xl bg-black object-cover" />
      {pending && <p role="status">جارٍ تأكيد التسليم…</p>}
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
      <div className="flex gap-3">
        {error && <button disabled={pending} onClick={() => setAttempt(value => value + 1)} className="min-h-12 flex-1 rounded-xl bg-brand px-4 font-bold text-white">إعادة المسح</button>}
        <button disabled={pending} onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-line px-4 font-bold">إغلاق</button>
      </div>
    </section>
  </div>;
}
