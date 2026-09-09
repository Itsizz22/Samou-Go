import { useState } from 'react';
import { getNotificationAudit, useResource } from '@samou-go/api-client';
const labels: Record<string, string> = { PENDING: 'قيد الإرسال', ACCEPTED: 'قبله مزوّد الإشعارات', PARTIAL: 'إرسال جزئي', FAILED: 'فشل الإرسال', NO_DEVICE: 'لا يوجد جهاز مسجل', DISABLED: 'الإرسال غير متاح', EXPIRED: 'انتهت صلاحية التنبيه' };
export function NotificationAuditPanel() {
  const [page, setPage] = useState(1);
  const resource = useResource(`notification-audit:${page}`, signal => getNotificationAudit(page, signal), { pollMs: 15000 });
  return <section dir="rtl" className="space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">سجل الإشعارات</h2><button className="btn-primary" disabled={resource.loading || resource.refreshing} onClick={resource.refresh}>تحديث</button></div>
    <p className="text-sm text-ink-muted">قبول الرسالة من Firebase لا يثبت ظهورها أو رنين الهاتف. يظهر وقت الفتح عند وصول تأكيد من التطبيق؛ غيابه لا يثبت عدم المشاهدة.</p>
    {resource.error && <p role="alert">تعذر تحديث السجل. أعد المحاولة؛ النتائج السابقة محفوظة على الشاشة.</p>}
    {resource.loading && <p role="status">جارٍ تحميل السجل…</p>}
    {resource.data && <>
      <div className="card-surface p-4"><strong>{resource.data.schedulerHealthy ? 'فحص التذكيرات يعمل' : 'فحص التذكيرات متأخر أو غير متاح'}</strong><p className="text-sm">آخر فحص ناجح: {resource.data.heartbeat?.lastSucceededAt ? new Date(resource.data.heartbeat.lastSucceededAt).toLocaleString('ar') : 'لم يسجل بعد'}</p></div>
      {resource.data.items.length === 0 && <p>لا توجد محاولات إرسال مسجلة بعد.</p>}
      {resource.data.items.map(item => <article key={item.id} className="card-surface space-y-2 p-4">
        <h3 className="font-bold">{item.title}</h3><p>{labels[item.status] ?? item.status} · نجح: {item.sentCount} · فشل: {item.failedCount}</p>
        <p className="break-all text-xs text-ink-muted">المستلم: {item.userId} · الطلب: {item.orderId ?? '—'}</p>
        <p className="text-sm">{new Date(item.createdAt).toLocaleString('ar')} · {item.openedAt ? `فتح المستخدم الإشعار: ${new Date(item.openedAt).toLocaleString('ar')}` : 'الفتح غير مؤكد'}</p>
        {item.errorCode && <code dir="ltr">{item.errorCode}</code>}
      </article>)}
      <div className="flex items-center gap-4"><button className="btn-primary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>السابق</button><span>{page}</span><button className="btn-primary" disabled={page * 30 >= resource.data.total} onClick={() => setPage(p => p + 1)}>التالي</button></div>
    </>}
  </section>;
}
