import { useEffect, useRef } from 'react';
import { ShoppingBag } from 'lucide-react';
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
  useEffect(() => { if (order && staff) dialog.current?.showModal(); else dialog.current?.close(); }, [order, staff]);
  const dismiss = () => { dismissIncomingOrder(); void stopOrderAlarm().catch(() => {}); };
  return <dialog ref={dialog} onCancel={dismiss} className="fixed inset-0 m-auto h-dvh max-h-none w-full max-w-none border-0 bg-canvas p-6 font-sans text-ink backdrop:bg-black/40" dir="rtl" aria-labelledby="incoming-order-title">
    {order && <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 py-6">
      <header className="flex items-center justify-between"><strong>سموع كويك</strong><span className="rounded-full bg-brand-tint px-3 py-1 text-sm font-bold text-brand-deep">طلب وارد</span></header>
      <div className="my-auto space-y-5 text-center"><ShoppingBag className="mx-auto size-24 rounded-3xl bg-brand-tint p-6 text-brand" aria-hidden="true" /><h1 id="incoming-order-title" className="text-3xl font-bold">{order.title}</h1><p className="text-ink-muted">طلبك التالي بانتظارك</p>
      <section className="rounded-3xl border border-line bg-surface p-5 text-start"><h2 className="mb-3 text-sm font-bold text-ink-muted">تفاصيل الطلب</h2><p className="whitespace-pre-line leading-8">{order.body}</p></section></div>
      <footer className="space-y-3 pb-[env(safe-area-inset-bottom)]"><button type="button" className="min-h-14 w-full rounded-2xl bg-brand px-4 py-3 font-bold text-white active:scale-95" onClick={() => { const id = order.orderId; dismiss(); navigate('/orders/' + encodeURIComponent(id)); }}>عرض تفاصيل الطلب</button><button type="button" className="min-h-14 w-full rounded-2xl border border-line bg-surface px-4 py-3 font-bold text-ink-muted" onClick={dismiss}>إغلاق التنبيه</button><p className="text-center text-xs text-ink-muted">إغلاق التنبيه لا يرفض الطلب</p></footer>
    </div>}
  </dialog>;
}
