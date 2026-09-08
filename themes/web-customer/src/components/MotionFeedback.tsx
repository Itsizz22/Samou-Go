import { useEffect, useState } from 'react';
import { useLanguage } from '@samou-go/ui';
import { formatCurrency } from '@/lib/delivery';
import { hapticConfirm } from '@/lib/haptics';

/** Each digit rolls once; no frame-by-frame React updates or interpolated money. */
export function RollingAmount({ value }: { value: number }) {
  const formatted = formatCurrency(value);
  return (
    <span dir="ltr" className="inline-flex tabular-nums">
      <span className="sr-only">{formatted}</span>
      <span aria-hidden="true" className="inline-flex overflow-hidden">
        {Array.from(formatted).map((digit, index) => (
          <span key={`${index}:${digit}`} className="sq-roll inline-block whitespace-pre">
            {digit}
          </span>
        ))}
      </span>
    </span>
  );
}

export function DeliveryPin({ pin }: { pin: string }) {
  const { t } = useLanguage();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <section className="sq-glow rounded-2xl border-2 border-brand bg-brand-surface p-4 text-center shadow-card">
      <p className="text-xs font-bold text-brand-dark">
        {t('شارك هذا الرمز مع الكابتن عند التسليم', 'Share this code with the captain on delivery')}
      </p>
      <button
        type="button"
        className={`relative mt-2 min-h-11 overflow-hidden rounded-xl px-4 text-2xl font-black tracking-widest text-brand-deep ${state === 'copied' ? 'sq-pin-copied' : ''}`}
        dir="ltr"
        aria-label={t('نسخ رمز التسليم', 'Copy delivery PIN')}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(pin);
            void hapticConfirm();
            setState('copied');
          } catch {
            setState('failed');
          }
        }}
      >
        {pin}
      </button>
      <p role="status" className="min-h-5 text-xs text-brand-dark">
        {state === 'copied'
          ? t('تم النسخ', 'Copied')
          : state === 'failed'
            ? t('تعذر النسخ — انسخ الرمز يدوياً', 'Could not copy — copy the code manually')
            : t('اضغط لنسخ الرمز', 'Tap to copy')}
      </p>
    </section>
  );
}
