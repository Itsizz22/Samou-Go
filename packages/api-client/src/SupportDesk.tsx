import { useState } from 'react';
import { TicketStatus, type SupportTicket } from '@samou-go/shared-types';
import { listSupportTickets, getSupportTicket, createSupportTicket, addSupportMessage, updateSupportTicketStatus } from './api';
import { useResource } from './useApi';
const labels: Record<string, string> = { OPEN: 'مفتوحة', IN_PROGRESS: 'قيد المتابعة', RESOLVED: 'تم الحل', CLOSED: 'مغلقة' };
/** Shared ticket UI for signed-in customers and the admin support inbox. */
export function SupportDesk({ userId, isAdmin = false, orderId }: { userId: string; isAdmin?: boolean; orderId?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(Boolean(orderId));
  const [subject, setSubject] = useState(orderId ? 'مشكلة في الطلب' : '');
  const [category, setCategory] = useState(orderId ? 'مشكلة في الطلب' : 'عام');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const tickets = useResource(`support:${userId}:${page}`, signal => listSupportTickets({ page, pageSize: 20 }, signal), { pollMs: 15000 });
  const detail = useResource(`support-detail:${userId}:${selected}`, signal => getSupportTicket(selected!, signal), { enabled: Boolean(selected), pollMs: 10000 });
  const refresh = () => { tickets.refresh(); if (selected) detail.refresh(); };
  const run = async (action: () => Promise<void>) => { if (pending) return; setPending(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذر تنفيذ العملية'); } finally { setPending(false); } };
  const open = (ticket: SupportTicket) => { setSelected(ticket.id); setCreating(false); setReply(''); setError(''); };
  const field = 'mt-2 min-h-11 w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink focus-visible:ring-2 focus-visible:ring-brand';
  return <section dir="rtl" className="space-y-4 text-ink" aria-label="تذاكر الدعم">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold">{isAdmin ? 'صندوق الدعم الفني' : 'تذاكر الدعم الفني'}</h2><button type="button" className="min-h-11 rounded-xl border border-line px-3 text-sm" onClick={refresh}>تحديث</button></div>
    {error && <p role="alert" className="rounded-xl bg-danger-tint p-3 text-sm text-danger-ink">{error}</p>}
    {(selected || creating) && <button type="button" disabled={pending} className="min-h-11 text-sm font-bold text-brand" onClick={() => { setSelected(null); setCreating(false); setError(''); }}>العودة إلى التذاكر</button>}
    {creating ? <form className="space-y-4 rounded-2xl border border-line bg-surface p-4" onSubmit={event => { event.preventDefault(); void run(async () => { const ticket = await createSupportTicket({ subject: subject.trim(), category, orderId, message: message.trim() }); setSubject(''); setMessage(''); open(ticket); tickets.refresh(); }); }}>
      {orderId && <p className="text-sm text-ink-muted">هذه التذكرة مرتبطة بطلبك تلقائياً.</p>}
      <label className="block text-sm font-bold">نوع المساعدة<select value={category} onChange={event => setCategory(event.target.value)} className={field}><option>عام</option><option>مشكلة في الطلب</option><option>الحساب</option><option>شكوى</option></select></label>
      <label className="block text-sm font-bold">عنوان التذكرة<input required maxLength={200} value={subject} onChange={event => setSubject(event.target.value)} className={field} /></label>
      <label className="block text-sm font-bold">كيف يمكننا مساعدتك؟<textarea required maxLength={2000} rows={4} value={message} onChange={event => setMessage(event.target.value)} className={field} /></label>
      <button disabled={pending || !subject.trim() || !message.trim()} className="btn-primary min-h-11 w-full">{pending ? 'جارٍ الإرسال…' : 'إرسال التذكرة'}</button>
    </form> : selected ? <>
      {detail.loading && <p role="status">جارٍ تحميل المحادثة…</p>}
      {detail.error && <button className="min-h-11 text-danger-ink" onClick={detail.refresh}>تعذر تحميل المحادثة — إعادة المحاولة</button>}
      {detail.data && !detail.loading && <div className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <div><h3 className="font-bold">{detail.data.subject}</h3><p className="mt-2 text-xs text-ink-muted">{detail.data.category} · {labels[detail.data.status]}</p><p dir="ltr" className="mt-2 break-all text-xs text-ink-muted">{detail.data.ticketNumber}</p></div>
        {isAdmin && <label className="block text-sm">حالة التذكرة<select className={field} disabled={pending} value={detail.data.status} onChange={event => { const status = event.target.value; if (!Object.values(TicketStatus).some(value => value === status)) return; void run(async () => { await updateSupportTicketStatus(selected, { status: status as SupportTicket['status'] }); refresh(); }); }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <ol className="space-y-3" aria-label="رسائل التذكرة">{detail.data.messages?.map(entry => <li key={entry.id} className={`rounded-2xl p-3 ${entry.senderRole === 'ADMIN' ? 'border border-brand/20 bg-brand/10' : 'bg-canvas'}`}><p className="mb-1 text-xs font-bold text-brand">{entry.senderRole === 'ADMIN' ? 'فريق الدعم' : entry.senderId === userId ? 'أنت' : 'صاحب التذكرة'}</p><p className="whitespace-pre-wrap wrap-break-word text-sm leading-7">{entry.message}</p><time className="mt-2 block text-xs text-ink-muted">{new Date(entry.createdAt).toLocaleString('ar-PS')}</time></li>)}</ol>
        {detail.data.status !== TicketStatus.CLOSED ? <form onSubmit={event => { event.preventDefault(); void run(async () => { await addSupportMessage(selected, { message: reply.trim() }); setReply(''); refresh(); }); }}><label className="block text-sm font-bold">اكتب ردك<textarea required maxLength={2000} rows={3} className={field} value={reply} onChange={event => setReply(event.target.value)} /></label><button disabled={pending || !reply.trim()} className="btn-primary mt-3 min-h-11 w-full">{pending ? 'جارٍ الإرسال…' : 'إرسال الرد'}</button></form> : <p className="text-sm text-ink-muted">هذه التذكرة مغلقة.</p>}
      </div>}
    </> : <>
      {!isAdmin && <button type="button" className="btn-primary min-h-11 w-full" onClick={() => setCreating(true)}>إنشاء تذكرة جديدة</button>}
      {tickets.loading && <p role="status">جارٍ تحميل التذاكر…</p>}
      {tickets.error && <button className="min-h-11 text-danger-ink" onClick={tickets.refresh}>تعذر تحميل التذاكر — إعادة المحاولة</button>}
      {!tickets.loading && !tickets.error && !tickets.data?.items.length && <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-ink-muted">لا توجد تذاكر حتى الآن.</p>}
      {tickets.data?.items.map(ticket => <button type="button" key={ticket.id} className="block min-h-20 w-full space-y-2 rounded-2xl border border-line bg-surface p-4 text-start focus-visible:ring-2 focus-visible:ring-brand" onClick={() => open(ticket)}><strong className="block text-sm">{ticket.subject}</strong><span className="text-xs text-ink-muted">{ticket.category} · {labels[ticket.status]}</span></button>)}
      {(tickets.data?.totalPages ?? 0) > 1 && <nav aria-label="صفحات التذاكر" className="flex items-center justify-between"><button className="min-h-11 px-3" disabled={page===1} onClick={() => setPage(v => v-1)}>السابق</button><span dir="ltr">{page} / {tickets.data?.totalPages}</span><button className="min-h-11 px-3" disabled={page >= (tickets.data?.totalPages ?? 0)} onClick={() => setPage(v => v+1)}>التالي</button></nav>}
    </>}
  </section>;
}
