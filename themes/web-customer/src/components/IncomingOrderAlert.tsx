import { useEffect, useRef } from 'react';
import { ArrowUpLeft, BellRing, ShoppingBag, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useIncomingOrder, dismissIncomingOrder } from '@/lib/incomingOrder';
import { useAuth } from '@/hooks/useApi';
import { stopOrderAlarm } from '@/lib/orderAlarm';

export function IncomingOrderAlert() {
  const order = useIncomingOrder();
  const auth = useAuth();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const staff = auth.user && ['STORE_MANAGER', 'CAPTAIN', 'ADMIN'].includes(auth.user.role);
  useEffect(() => {
    if (order && staff) dialog.current?.showModal();
    else dialog.current?.close();
  }, [order, staff]);
  const dismiss = () => { dismissIncomingOrder(); void stopOrderAlarm().catch(() => {}); };
  const lines = order?.body.split('\n').filter(line => line.trim()) ?? [];
  return <dialog ref={dialog} onCancel={dismiss} className="sq-incoming-order bg-canvas font-sans text-ink backdrop:bg-black/40" dir="rtl" aria-labelledby="incoming-order-title" aria-describedby="incoming-order-description">
    {order && <div className="sq-incoming-layout">
      <header className="flex items-center justify-between gap-3">
        <strong className="text-lg text-brand-deep">سموع كويك</strong>
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-tint px-3 py-2 text-sm font-bold text-brand-deep"><BellRing size={16} aria-hidden="true" />طلب وارد</span>
      </header>
      <main className="sq-incoming-content">
        <div className="sq-incoming-icon bg-brand-tint text-brand"><ShoppingBag size={48} strokeWidth={1.7} aria-hidden="true" /></div>
        <h1 id="incoming-order-title" className="mt-6 text-3xl font-bold leading-snug">{order.title.replace(/[🛒🚨]/gu, '').trim()}</h1>
        <p id="incoming-order-description" className="mt-3 text-base text-ink-muted">طلبك التالي بانتظارك</p>
        <section className="mt-7 w-full rounded-3xl border border-line bg-surface p-5 text-start">
          <h2 className="mb-3 text-sm font-bold text-ink-muted">تفاصيل الطلب</h2>
          {lines.map((line, index) => <p key={index} className={index === 0 ? 'break-words text-xl font-bold leading-relaxed' : 'mt-2 break-words text-base leading-relaxed text-ink-muted'}>{line}</p>)}
        </section>
      </main>
      <footer className="space-y-3">
        <button autoFocus type="button" className="sq-incoming-action bg-brand text-white" onClick={() => { const id = order.orderId; dismiss(); navigate('/orders/' + encodeURIComponent(id)); }}><ArrowUpLeft size={22} aria-hidden="true" />عرض تفاصيل الطلب</button>
        <button type="button" className="sq-incoming-action border border-line bg-surface text-ink-muted" onClick={dismiss}><X size={22} aria-hidden="true" />إغلاق التنبيه</button>
        <p className="text-center text-sm text-ink-muted">إغلاق التنبيه لا يرفض الطلب</p>
      </footer>
    </div>}
  </dialog>;
}
