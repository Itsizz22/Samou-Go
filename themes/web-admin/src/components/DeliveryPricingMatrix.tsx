import { useEffect, useState } from 'react';
import {
  importSamouTariff,
  getDeliveryRoutePricing,
  getPlatformSettings,
  saveDeliveryRoutePricing,
  useResource,
} from '@samou-go/api-client';
import type { DeliveryZone, DeliveryRoutePricing } from '@samou-go/shared-types';
const keyFor = (a: string, b: string) => JSON.stringify(a <= b ? [a, b] : [b, a]);
export function DeliveryPricingMatrix({ zones, onImported }: { zones: DeliveryZone[]; onImported: () => void }) {
  const platform = useResource('route-pricing-platform', getPlatformSettings, { pollMs: 30000 });
  const resource = useResource('delivery-route-pricing', getDeliveryRoutePricing);
  const [values, setValues] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(false);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (resource.data && !dirty && resource.data.revision >= revision) {
      setEnabled(resource.data.enabled);
      setRevision(resource.data.revision);
      setValues(
        Object.fromEntries(
          resource.data.rates.map(r => [keyFor(r.fromZoneId, r.toZoneId), String(r.fee)])
        )
      );
    }
  }, [resource.data, dirty, revision]);
  const active = zones.filter(z => z.isActive);
  const pairs = zones.flatMap((a, i) =>
    zones.slice(i).map(b => ({ a, b, key: keyFor(a.id, b.id) }))
  );
  const missing = pairs.filter(p => p.a.isActive && p.b.isActive && !values[p.key]?.trim()).length;
  const save = async () => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const rates: DeliveryRoutePricing['rates'] = [];
      for (const { a, b, key } of pairs) {
        const value = values[key]?.trim();
        if (!value) continue;
        const fee = Number(value);
        if (
          !Number.isFinite(fee) ||
          fee < 0 ||
          fee > 100000 ||
          Math.abs(fee * 100 - Math.round(fee * 100)) > 0.00001
        )
          throw new Error('أدخل أسعارًا صحيحة غير سالبة وبمنزلتين عشريتين كحد أقصى');
        const [fromZoneId, toZoneId] = a.id <= b.id ? [a.id, b.id] : [b.id, a.id];
        rates.push({ fromZoneId, toZoneId, fee });
      }
      const result = await saveDeliveryRoutePricing({ enabled, revision, rates });
      setRevision(result.revision);
      setDirty(false);
      setMessage('تم حفظ جدول الأسعار. الطلبات السابقة تحتفظ بأسعارها.');
      void resource.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ الأسعار');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      dir="rtl"
      className="mb-6 space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-6"
      aria-label="أسعار التوصيل بين المناطق"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-ink">أسعار التوصيل بين المناطق</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            سعر واحد للذهاب والإياب. اختر خلية لتعديلها؛ الخلايا القطرية للتوصيل داخل المنطقة نفسها.
            الأسعار بالشيكل.
          </p>
        </div>
        <span className="rounded-full bg-canvas px-3 py-2 text-xs font-bold text-brand">
          {resource.data?.enabled ? 'التسعير بالجدول مفعل' : 'الجدول قيد التجهيز'}
        </span>
      </div>
      <button type="button" disabled={busy || !resource.data || dirty} className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold text-brand disabled:opacity-50" onClick={async () => {
        if (!window.confirm('استيراد أسعار الملف المعتمد (31 منطقة)؟ يستبدل أسعار هذه المناطق ويوقف تسعير الجدول لحين مراجعته وتفعيله.')) return;
        setBusy(true); setError(''); setMessage('');
        try { const result = await importSamouTariff(revision); setRevision(result.revision); setDirty(false); await resource.reload(); onImported(); setMessage('تم استيراد 496 سعرًا. المناطق الجديدة معطلة لحين مراجعتها؛ فعّل المناطق وحدد مناطق المتاجر ثم فعّل الجدول.'); }
        catch (e) { setError(e instanceof Error ? e.message : 'تعذر الاستيراد'); }
        finally { setBusy(false); }
      }}>استيراد تسعيرة السموع المعتمدة</button>
      {platform.data?.freeDeliveryEnabled && <p className="rounded-xl bg-canvas p-3 text-sm font-bold text-brand">التوصيل المجاني مفعل حاليًا؛ تبقى أسعار هذا الجدول محفوظة لحين إيقافه من الإعدادات.</p>}
      {resource.error && (
        <p role="alert" className="text-sm">
          تعذر تحميل الأسعار.{' '}
          <button
            type="button"
            onClick={() => void resource.reload()}
            className="min-h-11 text-brand underline"
          >
            إعادة المحاولة
          </button>
        </p>
      )}
      {resource.loading && !resource.data && <p role="status">جارٍ تحميل الأسعار…</p>}
      {resource.data && (
        <>
          <div className="flex flex-wrap gap-3 text-xs text-ink-muted">
            <span>{active.length} منطقة نشطة</span>
            <span>{missing} سعرًا ناقصًا</span>
            <span>فارغ = غير محدد · 0 = توصيل مجاني</span>
          </div>
          <div
            className="relative isolate z-0 max-h-[32rem] overflow-auto rounded-xl border border-line"
            tabIndex={0}
            aria-label="جدول الأسعار؛ يمكن تمريره أفقيًا"
          >
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">أسعار من منطقة المتجر إلى منطقة الزبون</caption>
              <thead className="sticky top-0 z-20 bg-canvas">
                <tr>
                  <th className="sticky start-0 z-30 min-w-36 bg-canvas p-3 text-start">
                    من المتجر / إلى الزبون
                  </th>
                  {zones.map(z => (
                    <th key={z.id} scope="col" className="min-w-28 border-s border-line p-3">
                      {z.nameAr}
                      {!z.isActive && <small className="block font-normal">معطلة</small>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zones.map((a, i) => (
                  <tr key={a.id}>
                    <th
                      scope="row"
                      className="sticky start-0 z-10 border-t border-line bg-canvas p-3 text-start"
                    >
                      {a.nameAr}
                    </th>
                    {zones.map((b, j) => {
                      const key = keyFor(a.id, b.id);
                      return (
                        <td key={b.id} className="border-s border-t border-line p-2">
                          {j < i ? (
                            <span
                              dir="ltr"
                              className="block px-2 py-3 text-center text-ink-muted"
                              title="يُعدّل من الخلية المقابلة"
                            >
                              {values[key]?.trim() || '—'}
                            </span>
                          ) : (
                            <input
                              type="number"
                              inputMode="decimal"
                              dir="ltr"
                              min="0"
                              max="100000"
                              step="0.01"
                              aria-label={`من ${a.nameAr} إلى ${b.nameAr}`}
                              placeholder="—"
                              value={values[key] ?? ''}
                              disabled={busy}
                              onChange={e => {
                                setValues(v => ({ ...v, [key]: e.target.value }));
                                setDirty(true);
                                setMessage('');
                              }}
                              className="min-h-11 w-full min-w-20 rounded-lg border border-line bg-canvas px-2 text-center text-ink focus:border-brand focus:outline-none"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!zones.length && (
            <p className="text-sm text-ink-muted">أضف المناطق أدناه لتجهيز الجدول.</p>
          )}
          <label className="flex min-h-11 items-center gap-3 rounded-xl bg-canvas p-3 text-sm font-bold">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={e => {
                setEnabled(e.target.checked);
                setDirty(true);
              }}
            />
            تفعيل التسعير حسب منطقتي المتجر والزبون
          </label>
          <p className="text-xs leading-6 text-ink-muted">
            يمكن حفظ الجدول غير المكتمل دون تفعيله. التفعيل يتطلب اكتمال أسعار المناطق النشطة وتحديد
            منطقة كل متجر معتمد. إضافة منطقة لاحقًا تتطلب إكمال أسعارها؛ لا تُحتسب المسارات الناقصة
            مجانًا.
          </p>
          {error && (
            <p role="alert" className="text-sm font-bold">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm font-bold text-brand">
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || !dirty || (enabled && missing > 0)}
              onClick={() => void save()}
              className="min-h-11 rounded-xl bg-brand px-5 font-bold text-white disabled:opacity-50"
            >
              {busy ? 'جارٍ الحفظ…' : 'حفظ الأسعار'}
            </button>
            {dirty && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDirty(false);
                  setError('');
                  setMessage('');
                  void resource.reload();
                }}
                className="min-h-11 rounded-xl border border-line px-4 text-sm"
              >
                تجاهل التعديلات وإعادة التحميل
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
