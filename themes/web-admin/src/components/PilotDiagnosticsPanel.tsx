import { useEffect, useRef, useState } from 'react';
import { getPilotOrderDiagnostics } from '@samou-go/api-client';
export function PilotDiagnosticsPanel() {
  const [orderId, setOrderId] = useState(''); const [snapshot, setSnapshot] = useState<unknown>(null);
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function load() {
    controller.current?.abort(); const next = new AbortController(); controller.current=next;
    setBusy(true); setSnapshot(null); setError('');
    try { const result=await getPilotOrderDiagnostics(orderId.trim(),next.signal); if (!next.signal.aborted) setSnapshot(result); }
    catch { if (!next.signal.aborted) setError('تعذر جلب التشخيص. تحقق من معرّف الطلب والصلاحية والاتصال.'); }
    finally { if (!next.signal.aborted) setBusy(false); }
  }
  return <section className="card-surface space-y-3 p-4" aria-label="تشخيص طلب التجربة">
    <h3 className="font-bold">تشخيص طلب التجربة</h3>
    <p className="text-sm text-ink-muted">لقطة للأدمن: الطلب والعرض وGPS والمسار ومحاولات Firebase. لا تؤكد مشاهدة الإشعار على الهاتف. لا تشارك هذه البيانات خارج فريق الاختبار.</p>
    <form className="flex flex-wrap gap-2" onSubmit={event=>{event.preventDefault();void load();}}>
      <input aria-label="معرّف طلب التجربة" dir="ltr" maxLength={100} value={orderId} onChange={e=>{controller.current?.abort();setOrderId(e.target.value);setSnapshot(null);setBusy(false);}} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line px-3" />
      <button disabled={busy || !orderId.trim()} className="btn-primary">{busy?'جارٍ الفحص…':'عرض / تحديث التشخيص'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {snapshot != null && <pre dir="ltr" className="max-h-96 overflow-auto rounded-xl bg-canvas p-3 text-xs">{JSON.stringify(snapshot,null,2)}</pre>}
  </section>;
}
