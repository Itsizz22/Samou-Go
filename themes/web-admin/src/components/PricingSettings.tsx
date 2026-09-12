import { useEffect, useState } from 'react';
import { getPlatformSettings, updatePricingSettings } from '@samou-go/api-client';
export function PricingSettings() {
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [base, setBase] = useState('0');
  const [share, setShare] = useState('100');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    getPlatformSettings()
      .then(s => {
        if (!active) return;
        setFreeDelivery(s.freeDeliveryEnabled ?? false);
        setEnabled(s.autoPricingEnabled ?? false);
        setBase(String(s.baseDeliveryFee ?? 0));
        setShare(String(s.captainSharePercentage ?? 100));
        setReady(true);
      })
      .catch(() => {
        if (active) setMessage('تعذر تحميل إعدادات التسعير');
      });
    return () => {
      active = false;
    };
  }, []);
  const save = async () => {
    if (!ready || pending) return;
    const fee = Number(base),
      percentage = Number(share);
    if (
      !Number.isFinite(fee) ||
      fee < 0 ||
      !Number.isFinite(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      setMessage('تحقق من الرسم الأساسي ونسبة الكابتن (0–100)');
      return;
    }
    setPending(true);
    setMessage('');
    try {
      await updatePricingSettings({
        freeDeliveryEnabled: freeDelivery,
        autoPricingEnabled: enabled,
        baseDeliveryFee: fee,
        captainSharePercentage: percentage,
      });
      setMessage('تم حفظ التسعير');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="rounded-2xl border border-line bg-surface p-4" dir="rtl">
      <h2 className="mb-3 text-lg font-extrabold">إعدادات تسعير التوصيل</h2>
      <label className="mb-3 flex min-h-11 items-center gap-3 rounded-xl border border-line bg-canvas p-3 font-bold">
        <input
          type="checkbox"
          role="switch"
          checked={freeDelivery}
          disabled={!ready || pending}
          onChange={e => setFreeDelivery(e.target.checked)}
          className="size-5 accent-brand"
        />
        تفعيل التوصيل المجاني
      </label>
      <p className="mb-4 text-sm leading-6 text-ink-muted">
        عند التفعيل تكون رسوم التوصيل صفرًا للطلبات الجديدة، مع أولوية على جميع طرق التسعير. تبقى
        أسعار جدول المناطق محفوظة وتُستخدم عند إيقاف المجاني إذا كان الجدول مفعّلًا. الطلبات السابقة
        تحتفظ برسومها.
      </p>
      <label className="flex min-h-11 items-center gap-3 font-bold">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={!ready}
          onChange={event => setEnabled(event.target.checked)}
          className="h-5 w-5 accent-brand"
        />
        تفعيل التسعير السابق حسب منطقة الزبون
      </label>
      <p className="mt-2 text-sm text-ink-muted">
        عند التفعيل، سيتم احتساب تكلفة التوصيل تلقائياً للعميل وحصة الكابتن بناءً على تسعيرة المنطقة
        المحددة. جدول الأسعار بين منطقتين يُدار من «مناطق التوصيل» وله الأولوية على هذا الإعداد.
      </p>
      {enabled && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label>
            الرسم الأساسي
            <input
              aria-label="الرسم الأساسي"
              type="number"
              min="0"
              step="0.01"
              value={base}
              onChange={event => setBase(event.target.value)}
              className="input-field min-h-11 w-full"
            />
          </label>
          <label>
            حصة الكابتن %
            <input
              aria-label="حصة الكابتن"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={share}
              onChange={event => setShare(event.target.value)}
              className="input-field min-h-11 w-full"
            />
          </label>
        </div>
      )}
      <button className="btn-primary mt-4 min-h-11" disabled={!ready || pending} onClick={save}>
        {pending ? 'جارٍ الحفظ...' : 'حفظ التسعير'}
      </button>
      {message && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
