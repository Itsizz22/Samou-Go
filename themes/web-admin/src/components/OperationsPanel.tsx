import { getOperationsStatus, useResource } from '@samou-go/api-client';
export function OperationsPanel() {
  const state = useResource('operations-status', signal => getOperationsStatus(signal), { pollMs: 15000 });
  const data = state.data;
  return <section className="card-surface space-y-3 p-4" aria-label="حالة التشغيل">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">حالة التشغيل</h3><button type="button" className="btn-primary" disabled={state.loading || state.refreshing} onClick={state.refresh}>فحص الآن</button></div>
    {state.loading && <p role="status">جارٍ فحص التشغيل…</p>}
    {state.error && <p role="alert">تعذر الوصول إلى حالة التشغيل. النتائج السابقة قديمة؛ أعد المحاولة.</p>}
    {data && <>
      <p className="text-sm text-ink-muted">آخر تحديث: {new Date(data.checkedAt).toLocaleString('ar')}</p>
      <p>قاعدة البيانات: متصلة · التذكيرات: {data.schedulerHealthy ? 'تعمل' : 'تحتاج متابعة'}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <p>محاولات تحتاج متابعة خلال 24 ساعة: <strong dir="ltr">{data.notifications.failed}</strong></p>
        <p>قيد الإرسال لأكثر من 5 دقائق: <strong dir="ltr">{data.notifications.stuckPending}</strong></p>
        <p>أخطاء الخادم في الساعة الأخيرة: <strong dir="ltr">{data.errors.count}</strong></p>
      </div>
      {(!data.schedulerHealthy || data.notifications.failed > 0 || data.notifications.stuckPending > 0 || data.errors.count > 0) && <p role="status" className="font-bold">تحتاج الحالة إلى مراجعة: افحص سجل الإشعارات واتصل بالمتجر أو الكابتن عند تأخر الطلب.</p>}
      {data.errors.last.map((error, i) => <p key={error.at + i} className="text-sm"><code dir="ltr">{error.code}</code> · {new Date(error.at).toLocaleString('ar')}</p>)}
      <p className="text-xs text-ink-muted">أخطاء الخادم تخص العملية الحالية وتُصفّر عند إعادة تشغيلها، بحد أقصى 100 سجل. قبول Firebase لا يؤكد ظهور التنبيه على الهاتف. هذه اللوحة لا ترسل إنذارًا خارجيًا عند توقف الخادم.</p>
    </>}
  </section>;
}
