import { useEffect, useRef, useState } from 'react';
import { getPlatformSettings, updatePlatformSettings, uploadImage } from '@samou-go/api-client';
import type { HomeVideoAd } from '@samou-go/shared-types';

export function VideoAdSettings() {
  const [items, setItems] = useState<HomeVideoAd[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const load = () => {
    void getPlatformSettings().then(data => { setItems(data.homeVideos ?? []); setReady(true); })
      .catch(() => setMessage('تعذر تحميل الإعلانات. أعد المحاولة.'));
  };
  useEffect(() => { load(); return () => controller.current?.abort(); }, []);
  const update = (id: string, patch: Partial<HomeVideoAd>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  const attach = async (id: string, file: File, poster: boolean) => {
    if (busy || controller.current) return;
    if (poster ? !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024 : file.type !== 'video/mp4' || file.size > 40 * 1024 * 1024) {
      setMessage(poster ? 'اختر صورة حتى 8 ميغابايت.' : 'اختر MP4 حتى 40 ميغابايت.'); return;
    }
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setMessage('جارٍ رفع الملف…');
    try {
      const result = await uploadImage({ kind: poster ? 'banner' : 'video' }, file, abort.signal);
      if (!abort.signal.aborted) { update(id, poster ? { posterUrl: result.url } : { videoUrl: result.url }); setMessage('تم الرفع. اضغط حفظ الإعلانات لنشر التغيير.'); }
    } catch (error) {
      if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : 'تعذر رفع الملف. أعد المحاولة.');
    } finally { controller.current = null; if (!abort.signal.aborted) setBusy(false); }
  };
  const move = (index: number, offset: number) => setItems(current => {
    const copy = [...current], item = copy[index];
    if (!item || index + offset < 0 || index + offset >= copy.length) return current;
    copy.splice(index, 1); copy.splice(index + offset, 0, item); return copy;
  });
  return <section className="rounded-2xl border border-line bg-surface p-5" dir="rtl" aria-busy={busy}>
    <h2 className="text-lg font-bold">إعلانات الفيديو</h2>
    <p className="my-3 text-sm leading-7 text-ink-muted">قسم خاص في الرئيسية، بصلاحية الأدمن فقط. تعمل الفيديوهات بالتتابع ويمكن للزبون السحب. ارفع MP4 بترميز H.264، بدقة 1080p مقترحة وبمدة حتى دقيقتين وحجم حتى 40 ميغابايت. نحافظ على جودة الملف الأصلي. الصورة الافتتاحية اختيارية.</p>
    {!ready ? <button onClick={load} className="min-h-11 text-brand">إعادة التحميل</button> : <form onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      if (items.some(item => !item.videoUrl || !item.title.trim())) { setMessage('أدخل عنوانًا وارفع فيديو لكل إعلان.'); return; }
      setBusy(true);
      try { await updatePlatformSettings({ homeVideos: items }); setMessage('تم حفظ إعلانات الفيديو. تظهر عند تحديث الرئيسية أو خلال دقيقة.'); }
      catch { setMessage('تعذر الحفظ. أعد المحاولة.'); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="space-y-4">
        {!items.length && <p className="py-5 text-ink-muted">لا توجد إعلانات فيديو. يبقى القسم مخفيًا للزبون حتى تضيف إعلانًا.</p>}
        {items.map((item, index) => <div key={item.id} className="space-y-3 rounded-xl border border-line p-4">
          {item.videoUrl && <video src={item.videoUrl} poster={item.posterUrl} controls playsInline preload="metadata" className="mx-auto aspect-video w-full max-w-lg rounded-xl bg-ink object-contain" />}
          <label className="block text-sm font-bold">عنوان الإعلان<input required maxLength={120} value={item.title} onChange={event => update(item.id, { title: event.target.value })} className="input-field mt-1 w-full" /></label>
          <div className="grid gap-3 sm:grid-cols-2">{[false, true].map(poster => <label key={String(poster)} className="block text-sm font-bold">{poster ? 'الصورة الافتتاحية' : 'ملف الفيديو'}<input type="file" accept={poster ? 'image/jpeg,image/png,image/webp' : 'video/mp4'} className="mt-2 block w-full text-sm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void attach(item.id, file, poster); }} /></label>)}</div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={item.enabled} onChange={event => update(item.id, { enabled: event.target.checked })} />نشر الإعلان</label>
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="min-h-11 px-2 text-brand disabled:opacity-40">تقديم</button>
            <button type="button" disabled={index === items.length - 1} onClick={() => move(index, 1)} className="min-h-11 px-2 text-brand disabled:opacity-40">تأخير</button>
            <button type="button" onClick={() => setItems(current => current.filter(ad => ad.id !== item.id))} className="min-h-11 px-2 text-danger-ink">حذف الإعلان</button>
          </div>
        </div>)}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={items.length >= 20} onClick={() => setItems(current => [...current, { id: crypto.randomUUID(), title: '', videoUrl: '', enabled: true }])} className="min-h-11 rounded-xl border border-brand px-4 font-bold text-brand">إضافة فيديو</button>
          <button type="submit" className="min-h-11 rounded-xl bg-brand px-4 font-bold text-white">{busy ? 'جارٍ العمل…' : 'حفظ الإعلانات'}</button>
        </div>
      </fieldset>
    </form>}
    <p role="status" className="mt-3 text-sm">{message}</p>
  </section>;
}
