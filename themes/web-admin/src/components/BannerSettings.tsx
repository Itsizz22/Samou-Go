import { useEffect, useState } from 'react';
import { getPlatformSettings, updatePlatformSettings } from '@samou-go/api-client';
import { DEFAULT_HOME_BANNERS, type HomeBanner } from '@samou-go/shared-types';

export function BannerSettings() {
  const [items, setItems] = useState<HomeBanner[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = () => {
    setMessage('');
    void getPlatformSettings().then(settings => { setItems(settings.homeBanners ?? DEFAULT_HOME_BANNERS); setReady(true); }).catch(() => setMessage('تعذّر تحميل البانرات، أعد المحاولة.'));
  };
  useEffect(load, []);
  const update = (id: string, patch: Partial<HomeBanner>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  const move = (index: number, offset: number) => setItems(current => {
    const copy = [...current]; const item = copy[index];
    if (!item || index + offset < 0 || index + offset >= copy.length) return current;
    copy.splice(index, 1); copy.splice(index + offset, 0, item); return copy;
  });
  return <section dir="rtl" className="rounded-2xl border border-line bg-surface p-4">
    <h2 className="text-lg font-bold">بانرات الصفحة الرئيسية</h2>
    <p className="mt-2 text-sm text-ink-muted">أضف رابط صورة HTTPS، ثم اختر عرض الصورة كاملة للحفاظ على النصوص أو ملء الإطار مع ضبط موضع القص. المعاينة بنفس ارتفاع بانر الهاتف.</p>
    {!ready ? <button type="button" onClick={load} className="min-h-11 text-brand">إعادة تحميل البانرات</button> : <form onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
      try { await updatePlatformSettings({ homeBanners: items }); setMessage('تم حفظ البانرات.'); }
      catch { setMessage('تعذّر الحفظ. تأكد من روابط الصور والعناوين ثم أعد المحاولة.'); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="mt-4 space-y-4">
        {items.map((item, index) => <div key={item.id} className="rounded-xl border border-line p-3">
          <div className="mx-auto mb-3 max-w-md overflow-hidden rounded-2xl border border-line bg-white">
            {item.imageUrl && <img src={item.imageUrl} alt={item.title || 'معاينة البانر'} className="h-44 w-full" style={{ objectFit: item.fit, objectPosition: `50% ${item.positionY}%` }} />}
            <p className="bg-surface px-4 py-3 text-sm font-bold">{item.title || 'عنوان البانر'}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">العنوان<input required maxLength={120} value={item.title} onChange={event => update(item.id, { title: event.target.value })} className="input-field mt-1 w-full" /></label>
            <label className="text-sm font-bold">رابط الصورة<input required maxLength={2048} dir="ltr" value={item.imageUrl} placeholder="https://…" onChange={event => update(item.id, { imageUrl: event.target.value })} className="input-field mt-1 w-full" /></label>
            <label className="text-sm font-bold">طريقة العرض<select value={item.fit} onChange={event => update(item.id, { fit: event.target.value === 'cover' ? 'cover' : 'contain' })} className="input-field mt-1 w-full"><option value="contain">الصورة كاملة — دون قص</option><option value="cover">ملء الإطار — قص الأطراف</option></select></label>
            <label className="text-sm font-bold">الموضع الرأسي<input type="range" min={0} max={100} disabled={item.fit !== 'cover'} value={item.positionY} onChange={event => update(item.id, { positionY: Number(event.target.value) })} className="mt-3 block w-full accent-brand" /></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={item.enabled} onChange={event => update(item.id, { enabled: event.target.checked })} />عرض البانر</label>
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="min-h-11 px-2 text-brand disabled:opacity-40">تقديم</button>
            <button type="button" disabled={index === items.length - 1} onClick={() => move(index, 1)} className="min-h-11 px-2 text-brand disabled:opacity-40">تأخير</button>
            <button type="button" onClick={() => setItems(current => current.filter(banner => banner.id !== item.id))} className="min-h-11 px-2 text-danger-ink">حذف</button>
          </div>
        </div>)}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={items.length >= 12} onClick={() => setItems(current => [...current, { id: crypto.randomUUID(), title: '', imageUrl: '', enabled: true, fit: 'contain', positionY: 50 }])} className="min-h-11 rounded-xl border border-brand px-4 font-bold text-brand">إضافة بانر</button>
          <button type="submit" className="min-h-11 rounded-xl bg-brand px-4 font-bold text-white">{busy ? 'جارٍ الحفظ…' : 'حفظ البانرات'}</button>
        </div>
      </fieldset>
    </form>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
