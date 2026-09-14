import { useEffect, useId, useRef } from 'react';
import type { Product } from '@samou-go/shared-types';

export function ProductPauseDialog({ product, pending, onChoose, onClose }: {
  product: Product; pending: boolean; onChoose: (minutes: number | null) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const trigger = document.activeElement;
    const previous = document.body.style.overflow;
    ref.current?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={onClose} onClose={onClose} className="m-auto w-[min(92vw,400px)] rounded-3xl border border-line bg-surface p-5 text-ink backdrop:bg-black/40" dir="rtl">
    <h2 id={titleId} className="text-lg font-extrabold">إيقاف {product.nameAr}</h2>
    <p className="mb-4 mt-2 text-sm leading-6 text-ink-muted">متى يعود متاحاً للطلب؟ يمكنك تفعيله يدوياً قبل الموعد.</p>
    <div className="grid gap-2">
      {[{ label: 'لمدة ساعة', value: 60 }, { label: 'لمدة ساعتين', value: 120 }, { label: 'حتى نهاية اليوم', value: -1 }, { label: 'حتى أعيد تفعيله', value: null }].map(option => <button key={option.label} type="button" disabled={pending} onClick={() => onChoose(option.value)} className="min-h-12 rounded-xl border border-line bg-canvas px-4 text-start text-sm font-bold hover:border-brand disabled:opacity-50">{option.label}</button>)}
    </div>
    <button type="button" disabled={pending} className="mt-3 min-h-11 w-full text-sm text-ink-muted" onClick={onClose}>رجوع</button>
  </dialog>;
}
