import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '@samou-go/ui';
import { Check, MapPin, MessageCircle, LocateFixed } from 'lucide-react';
import { updateProfile } from '@samou-go/api-client';
import { useAuth, updateMyLocation } from '@/hooks/useApi';
import { readSavedAddresses, upsertAddress, writeSavedAddresses } from '@/lib/address-book';
import { finishAccountSetup } from '@/lib/account-setup';
import { useDeliveryZone } from '@/components/ZoneProvider';

export function AccountSetupScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const zone = useDeliveryZone();
  const [step, setStep] = useState<'whatsapp' | 'location'>('whatsapp');
  const [prefix, setPrefix] = useState<'970' | '972' | ''>('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const phone = (auth.user?.phone ?? '').replace(/\D/g, '').replace(/^(?:00)?97[02]/, '').replace(/^0/, '');
  const finish = () => { finishAccountSetup(); navigate('/home', { replace: true }); };
  const saveWhatsApp = async () => {
    if (!prefix || busy) return;
    setBusy(true); setError('');
    try {
      const user = await updateProfile({ whatsappNumber: `+${prefix}${phone}` });
      auth.setUser(user);
      setStep('location');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر حفظ رقم واتساب. حاول مجدداً.'); }
    finally { setBusy(false); }
  };
  const locate = () => {
    if (locating) return;
    if (!navigator.geolocation) { setError('يمكنك كتابة عنوانك يدوياً؛ تحديد الموقع غير متاح على هذا الجهاز.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(position => {
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }); setLocating(false);
    }, () => { setLocating(false); setError('لم نستطع تحديد الموقع. اكتب العنوان يدوياً أو أعد المحاولة.'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  };
  const saveAddress = async () => {
    if (busy || address.trim().length < 5 || !zone.activeZone || locating) return;
    setBusy(true); setError('');
    try {
      if (coords) await updateMyLocation(coords.lat, coords.lng);
      writeSavedAddresses(upsertAddress(readSavedAddresses(), { id: crypto.randomUUID(), label: 'المنزل', tag: 'home', addressText: address.trim(), ...(coords ?? {}) }));
      finish();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر حفظ الموقع. حاول مجدداً.'); }
    finally { setBusy(false); }
  };
  return <main dir="rtl" className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-8 text-ink">
    <section className="w-full max-w-md" aria-labelledby="setup-title">
      <BrandLogo size={56} />
      <div className="mb-7 mt-5 flex gap-2" aria-label={step === 'whatsapp' ? 'الخطوة الأولى من خطوتين' : 'الخطوة الثانية من خطوتين'}><span className="h-1 flex-1 rounded-full bg-brand" /><span className={`h-1 flex-1 rounded-full ${step === 'location' ? 'bg-brand' : 'bg-line'}`} /></div>
      <span className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-brand-surface text-brand">{step === 'whatsapp' ? <MessageCircle size={28} /> : <MapPin size={28} />}</span>
      <h1 id="setup-title" className="text-2xl font-extrabold">{step === 'whatsapp' ? 'على أي مقدمة تستخدم واتساب؟' : 'أين نوصّل طلبك؟'}</h1>
      <p className="mb-6 mt-3 text-sm leading-7 text-ink-muted">{step === 'whatsapp' ? 'اختر المقدمة الموجودة في حسابك على واتساب ليسهل على المتجر والسائق التواصل معك.' : 'حدد منطقتك وأضف عنواناً واضحاً. يمكنك مشاركة موقعك لمساعدة السائق أو كتابة العنوان يدوياً.'}</p>
      {step === 'whatsapp' ? <>
        <p className="mb-4 text-sm">رقم حسابك <bdi className="ms-2 font-bold">{auth.user?.phone}</bdi></p>
        <div className="grid grid-cols-2 gap-3" role="group" aria-label="مقدمة رقم واتساب">{(['970', '972'] as const).map(value => <button key={value} type="button" disabled={busy} aria-pressed={prefix === value} onClick={() => setPrefix(value)} className={`flex min-h-20 items-center justify-center gap-2 rounded-2xl border text-xl font-bold ${prefix === value ? 'border-brand bg-brand-surface text-brand' : 'border-line bg-surface'}`}><bdi>+{value}</bdi>{prefix === value && <Check size={18} />}</button>)}</div>
        {prefix && <p className="mt-4 text-center text-lg font-bold" dir="ltr">+{prefix}{phone}</p>}
        <p className="mt-4 text-xs leading-6 text-ink-muted">هذا رقم للتواصل على واتساب؛ رقم تسجيل الدخول يبقى كما هو.</p>
        <button type="button" disabled={!prefix || busy} onClick={() => void saveWhatsApp()} className="btn-primary mt-6 min-h-12 w-full justify-center disabled:opacity-50">{busy ? 'جارٍ الحفظ…' : 'حفظ ومتابعة'}</button>
      </> : <>
        <label className="block text-sm font-bold">منطقة التوصيل<select className="input-field mt-2 min-h-12 w-full" value={zone.activeZone?.id ?? ''} disabled={zone.loading} onChange={event => zone.selectZone(event.target.value)}><option value="" disabled>اختر منطقتك</option>{zone.zones.map(item => <option key={item.id} value={item.id}>{item.nameAr}</option>)}</select></label>
        {zone.error && <button type="button" onClick={zone.reload} className="min-h-11 text-sm text-brand">تعذر تحميل المناطق — إعادة المحاولة</button>}
        <button type="button" disabled={locating || busy} onClick={locate} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand text-sm font-bold text-brand"><LocateFixed size={18} />{locating ? 'جارٍ تحديد الموقع…' : coords ? 'تم تحديد موقعك — تحديث' : 'استخدم موقعي الحالي'}</button>
        <label className="mt-5 block text-sm font-bold">العنوان وعلامة مميزة<textarea value={address} onChange={event => setAddress(event.target.value)} maxLength={500} className="input-field mt-2 min-h-28 w-full resize-none" placeholder="الحي، الشارع، وبجانب أي معلم…" /></label>
        <button type="button" disabled={busy || locating || address.trim().length < 5 || !zone.activeZone} onClick={() => void saveAddress()} className="btn-primary mt-5 min-h-12 w-full justify-center disabled:opacity-50">{busy ? 'جارٍ الحفظ…' : 'حفظ وابدأ التصفح'}</button>
        <button type="button" disabled={busy || locating} onClick={finish} className="mt-2 min-h-11 w-full text-sm text-ink-muted">سأحدد عنواني عند الطلب</button>
      </>}
      {error && <p role="alert" className="mt-4 text-sm leading-6 text-danger-ink">{error}</p>}
    </section>
  </main>;
}
