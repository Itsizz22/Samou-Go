import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { OrderChatMessage, OrderChatOverview } from '@samou-go/shared-types';
import { getToken, subscribeTokenChange, getOrderChat, getOrderChatPeers, markOrderChatRead, sendOrderChat } from './api';

export function OrderChat({ orderId }: { orderId: string }) {
  const session = useSyncExternalStore(subscribeTokenChange, getToken);
  return <Conversation key={`${orderId}:${session}`} orderId={orderId} />;
}
function Conversation({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get("chat") === "1");
  const [overview, setOverview] = useState<OrderChatOverview | null>(null);
  const [peer, setPeer] = useState(() => new URLSearchParams(window.location.search).get('peer') ?? '');
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const openConversation = (event: Event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail !== 'object' || !('orderId' in detail) || detail.orderId !== orderId || !('peerId' in detail) || typeof detail.peerId !== 'string') return;
      setPeer(detail.peerId); setOpen(true); root.current?.scrollIntoView({block:'nearest'});
    };
    window.addEventListener('samou:open-order-chat',openConversation);
    return () => window.removeEventListener('samou:open-order-chat',openConversation);
  },[orderId]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries.some(e => e.isIntersecting)));
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController(); let running = false;
    const load = async () => {
      if (document.hidden || running) return; running = true;
      try { const data = await getOrderChatPeers(orderId, controller.signal); if (!controller.signal.aborted) { setOverview(data); setError(''); } }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'تعذر تحميل المحادثات'); }
      finally { running = false; }
    };
    void load(); const timer = window.setInterval(() => void load(), open ? 5000 : 30000);
    document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [orderId, open, visible]);
  const selected = overview?.peers.find(p => p.id === peer);
  return <section ref={root} dir="rtl" className="my-3 rounded-2xl border border-line bg-surface p-4 text-start text-ink" aria-label="محادثات الطلب">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between gap-3 text-sm font-bold text-brand"><span>محادثات الطلب</span><span>{overview?.peers.reduce((sum, p) => sum + p.unread, 0) || ''} {open ? 'إغلاق' : 'فتح'}</span></button>
    {open && <>
      <p className="mb-3 text-xs leading-6 text-ink-muted">اختر الطرف الذي تريد مراسلته. الرسائل خاصة بينكما.</p>
      {error && <p role="alert" className="text-sm">{error}</p>}
      {!overview && !error && <p role="status">جارٍ تحميل المحادثات…</p>}
      <div className="flex flex-wrap gap-2">{overview?.peers.map(p => <button type="button" key={p.id} aria-pressed={peer === p.id} onClick={() => setPeer(p.id)} className={`min-h-11 rounded-xl border border-line px-3 py-2 text-sm ${peer === p.id ? 'bg-brand text-white' : 'bg-canvas text-ink'}`}>
        {p.role === 'CUSTOMER' ? 'الزبون' : p.role === 'CAPTAIN' ? 'الكابتن' : 'المتجر'} · {p.name} {p.unread > 0 && <span dir="ltr">({p.unread})</span>}
      </button>)}</div>
      {selected && <Thread key={selected.id} orderId={orderId} peerId={selected.id} closed={overview?.closed ?? true} visible={visible} onRead={() => setOverview(value => value ? { ...value, peers: value.peers.map(p => p.id === selected.id ? { ...p, unread: 0 } : p) } : value)} />}
    </>}
  </section>;
}
function Thread({ orderId, peerId, closed, visible, onRead }: { orderId: string; peerId: string; closed: boolean; visible: boolean; onRead: () => void }) {
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const pagingStarted = useRef(false);
  const knownIds = useRef(new Set<string>());
  const retry = useRef<{ recipientId: string; message: string; clientMessageId: string } | null>(null);
  const alive = useRef(true); const readCallback = useRef(onRead); readCallback.current = onRead;
  const scroll = useRef<HTMLDivElement>(null);
  const merge = (incoming: OrderChatMessage[]) => { incoming.forEach(m => knownIds.current.add(m.id)); setMessages(old => [...new Map([...old, ...incoming].map(m => [m.id, m])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController(); let running = false;
    const load = async () => {
      if (document.hidden || running) return; running = true;
      try {
        const page = await getOrderChat(orderId, peerId, undefined, controller.signal);
        if (controller.signal.aborted) return;
        const nearBottom = !scroll.current || scroll.current.scrollHeight - scroll.current.scrollTop - scroll.current.clientHeight < 100;
        const gap = page.nextBefore !== null && page.items[0] && !knownIds.current.has(page.items[0].id);
        merge(page.items); if (!pagingStarted.current || gap) { setBefore(page.nextBefore); pagingStarted.current = true; } setError(''); setLoading(false);
        if (nearBottom) requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; });
        const incoming = [...page.items].reverse().find(m => m.senderId === peerId && !m.readAt);
        if (incoming && nearBottom && !document.hidden) { await markOrderChatRead(orderId, peerId, incoming.id, controller.signal); if (!controller.signal.aborted) readCallback.current(); }
      } catch (e) { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : 'تعذر تحميل الرسائل'); setLoading(false); } }
      finally { running = false; }
    };
    void load(); const timer = window.setInterval(() => void load(), 4000); document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [orderId, peerId, visible]);
  const send = async () => {
    if (busy || closed || !draft.trim()) return;
    const body = retry.current?.message === draft.trim() ? retry.current : { recipientId: peerId, message: draft.trim(), clientMessageId: crypto.randomUUID() };
    retry.current = body; setBusy(true); setError('');
    try { const message = await sendOrderChat(orderId, body); if (alive.current) { merge([message]); setDraft(''); retry.current = null; requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }); } }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'تعذر الإرسال. حاول مجددًا.'); }
    finally { if (alive.current) setBusy(false); }
  };
  return <div className="mt-3 space-y-3">
    <div ref={scroll} className="max-h-80 space-y-3 overflow-y-auto rounded-xl bg-canvas p-3" aria-label="الرسائل">
      {before && <button type="button" disabled={busy} className="min-h-11 w-full text-sm text-brand" onClick={async () => { setBusy(true); try { const page = await getOrderChat(orderId, peerId, before); if (alive.current) { merge(page.items); setBefore(page.nextBefore); } } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'تعذر تحميل الرسائل السابقة'); } finally { if (alive.current) setBusy(false); } }}>تحميل الرسائل السابقة</button>}
      {loading ? <p role="status">جارٍ التحميل…</p> : messages.length === 0 ? <p className="py-4 text-center text-sm text-ink-muted">ابدأ المحادثة بخصوص طلبك</p> : messages.map(m => <div key={m.id} className={`max-w-[90%] rounded-xl p-3 text-sm ${m.senderId === peerId ? 'me-auto border border-line bg-surface' : 'ms-auto bg-brand text-white'}`}>
        <p dir="auto" className="whitespace-pre-wrap wrap-break-word">{m.message}</p><p className="mt-2 text-xs opacity-75"><time dir="ltr">{new Date(m.createdAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</time> {m.senderId !== peerId && (m.readAt ? 'تمت القراءة' : 'تم الإرسال')}</p>
      </div>)}
    </div>
    {error && <p role="alert" className="text-sm">{error} — يمكنك إعادة المحاولة.</p>}
    {closed ? <p className="text-sm text-ink-muted">انتهى الطلب. يمكنك قراءة المحادثة السابقة.</p> : <form onSubmit={e => { e.preventDefault(); void send(); }} className="space-y-2">
      <label className="sr-only" htmlFor={`chat-${orderId}-${peerId}`}>رسالتك</label><textarea id={`chat-${orderId}-${peerId}`} value={draft} disabled={busy} onChange={e => setDraft(e.target.value)} dir="auto" rows={2} maxLength={2000} placeholder="اكتب رسالتك…" className="w-full resize-none rounded-xl border border-line bg-canvas p-3 text-sm text-ink" />
      <button type="submit" disabled={busy || !draft.trim()} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'جارٍ الإرسال…' : 'إرسال'}</button>
    </form>}
  </div>;
}
