/**
 * Samou' Go — store profile management panel.
 *
 * Lets the store manager update their store's name, phone number, and
 * active/open status. Writes go through `PATCH /api/v1/stores/:id`.
 */

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ImagePlus,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  Store,
  X,
} from 'lucide-react';
import { ApiError, removeCurrentImage, updateStore, useStore, useToast, useUploadImage } from '@samou-go/api-client';
import type { Store as StoreType } from '@samou-go/shared-types';
import { useLanguage } from '@samou-go/ui';

interface Props {
  storeId: string;
}

interface FormState {
  nameAr: string;
  nameEn: string;
  phone: string;
  isActive: boolean;
}

function formFromStore(s: StoreType): FormState {
  return {
    nameAr: s.nameAr,
    nameEn: s.nameEn,
    phone: s.phone,
    isActive: s.isActive,
  };
}

export function StoreProfilePanel({ storeId }: Props) {
  const toast = useToast();
  const upload = useUploadImage();
  const { t, language } = useLanguage();

  // Load just this store's header data for the form.
  // useStore hits GET /stores/:id (public) which includes phone, nameAr, nameEn, isActive.
  const storeResource = useStore(storeId);
  const storeData = storeResource.data ?? null;

  // Logo preview — kept locally so an upload/remove reflects immediately, then
  // the `useStore` reload re-syncs it from the server.
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (storeData) setLogoSrc(storeData.logoUrl);
  }, [storeData]);

  // Cover (hero background) preview — same local-then-reload pattern.
  const [coverSrc, setCoverSrc] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (storeData) setCoverSrc(storeData.coverUrl);
  }, [storeData]);

  const [form, setForm] = useState<FormState>({
    nameAr: '',
    nameEn: '',
    phone: '',
    isActive: true,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Initialise form from API data
  useEffect(() => {
    if (storeData && !dirty) {
      setForm(formFromStore(storeData));
    }
  }, [storeData, dirty]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!form.nameAr.trim()) { setSaveError(t('اسم المتجر مطلوب', 'Store name required')); return; }
    setSaving(true);
    setSaveError(null);
    try {
      await updateStore(storeId, {
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim() || undefined,
        // Always send phone when it has a non-empty value so the backend persists it.
        // Using undefined would silently skip the phone update in the Prisma data spread.
        phone: form.phone.trim() ? form.phone.trim() : undefined,
        isActive: form.isActive,
      });
      setDirty(false);
      setSaved(true);
      void storeResource.reload();
      toast.success('تم حفظ بيانات المتجر', 'Store profile saved');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const msg = err instanceof ApiError
        ? language === 'ar' ? err.message : err.localizedMessage
        : err instanceof Error ? err.message : String(err);
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const [locBusy, setLocBusy] = useState(false);
  const [locMessage, setLocMessage] = useState<{ ar: string; en: string } | null>(null);

  const handleReset = () => {
    if (!storeData) return;
    setForm(formFromStore(storeData));
    setDirty(false);
    setSaveError(null);
  };

  const captureStoreLocation = () => {
    if (locBusy || !('geolocation' in navigator)) {
      setLocMessage({ ar: 'تحديد الموقع غير مدعوم', en: 'Geolocation is unavailable' });
      return;
    }
    setLocBusy(true);
    setLocMessage({ ar: 'جارٍ تحديد الموقع…', en: 'Detecting location…' });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          await updateStore(storeId, {
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          setLocMessage({
            ar: `تم حفظ الموقع: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
            en: `Location saved: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
          });
          void storeResource.reload();
          toast.success('تم تحديث موقع المتجر', 'Store location updated');
        } catch {
          setLocMessage({ ar: 'تعذّر حفظ الموقع — حاول مجدداً', en: 'Failed to save location — try again' });
        } finally {
          setLocBusy(false);
        }
      },
      () => {
        setLocBusy(false);
        setLocMessage({ ar: 'تعذّر تحديد الموقع — تحقق من إذن الموقع', en: 'Location permission was not granted' });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  /* ---- Store logo (attach / change / remove) ------------------------------ */
  const handleLogoPicked = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('الملف أكبر من 8MB', 'File exceeds 8MB');
      return;
    }
    if (logoInputRef.current) logoInputRef.current.value = '';
    setLogoBusy(true);
    try {
      const result = await upload.run({ kind: 'store', resourceId: storeId, file });
      if (!result) {
        toast.error(upload.error?.message ?? 'تعذّر رفع الشعار', 'Upload failed');
        return;
      }
      setLogoSrc(result.url);
      toast.success('تم تحديث شعار المتجر', 'Store logo updated');
      void storeResource.reload();
    } finally {
      setLogoBusy(false);
    }
  };

  const handleLogoRemove = async () => {
    setLogoBusy(true);
    try {
      await removeCurrentImage('store', storeId);
      setLogoSrc(null);
      toast.info('تمت إزالة الشعار', 'Store logo removed');
      void storeResource.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('تعذّر إزالة الشعار', msg);
    } finally {
      setLogoBusy(false);
    }
  };

  /* ---- Store cover (attach / change / remove) ----------------------------- */
  const handleCoverPicked = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('الملف أكبر من 8MB', 'File exceeds 8MB');
      return;
    }
    if (coverInputRef.current) coverInputRef.current.value = '';
    setCoverBusy(true);
    try {
      const result = await upload.run({ kind: 'store', resourceId: storeId, purpose: 'cover', file });
      if (!result) {
        toast.error(upload.error?.message ?? 'تعذّر رفع الغلاف', 'Upload failed');
        return;
      }
      setCoverSrc(result.url);
      toast.success('تم تحديث غلاف المتجر', 'Store cover updated');
      void storeResource.reload();
    } finally {
      setCoverBusy(false);
    }
  };

  const handleCoverRemove = async () => {
    setCoverBusy(true);
    try {
      await removeCurrentImage('store', storeId, 'cover');
      setCoverSrc(null);
      toast.info('تمت إزالة الغلاف', 'Store cover removed');
      void storeResource.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('تعذّر إزالة الغلاف', msg);
    } finally {
      setCoverBusy(false);
    }
  };

  if (storeResource.loading) {
    return (
      <div className="space-y-4" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <div key={i} className="skeleton h-14 rounded-xl shadow-card" />
        ))}
      </div>
    );
  }

  if (storeResource.error) {
    return (
      <div className="rounded-xl border border-danger-tint bg-surface p-5 text-center shadow-card">
        <AlertTriangle className="mx-auto text-danger" size={22} />
        <p className="mt-2 text-sm font-bold text-danger-ink">{language === 'ar' ? storeResource.error.message : storeResource.error.localizedMessage}</p>
        <button
          type="button"
          onClick={() => void storeResource.refresh()}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-dark"
        >
          <RefreshCw size={13} /> إعادة المحاولة
        </button>
      </div>
    );
  }

  const coords =
    storeData && storeData.latitude !== null && storeData.longitude !== null
      ? { lat: storeData.latitude, lng: storeData.longitude }
      : null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {/* Store ID badge */}
        <div className="border-b border-line-soft bg-canvas px-5 py-3 flex items-center gap-2">
          <Store size={15} className="text-brand" />
          <span className="text-[11px] font-semibold text-ink-muted" dir="ltr">
            Store ID: {storeId}
          </span>
        </div>

        {/* Store logo */}
        <div className="p-5 pb-0">
          <div className="rounded-xl border border-line bg-canvas p-3">
            <span className="mb-2 block text-xs font-bold text-ink">
              {t('شعار المتجر', 'Store logo')}
            </span>
            <div className="flex items-center gap-3">
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt={form.nameAr || 'Store logo'}
                  className="h-16 w-16 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                  <Store size={20} />
                </span>
              )}
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Choose a store logo"
                  onChange={e => void handleLogoPicked(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoBusy}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[11px] font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
                  aria-label="Change store logo"
                >
                  {logoBusy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                  {logoSrc ? t('تغيير', 'Change') : t('إضافة', 'Add')}
                </button>
                {logoSrc && (
                  <button
                    type="button"
                    onClick={() => void handleLogoRemove()}
                    disabled={logoBusy}
                    className="flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[11px] font-bold text-ink-muted transition hover:bg-danger-tint hover:text-danger-ink active:scale-95 disabled:opacity-60"
                    aria-label="Remove store logo"
                  >
                    <X size={12} />
                    {t('إزالة', 'Remove')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Store cover */}
        <div className="p-5 pb-0">
          <div className="rounded-xl border border-line bg-canvas p-3">
            <span className="mb-2 block text-xs font-bold text-ink">
              {t('غلاف المتجر', 'Store cover')}
              <span className="ms-1 font-normal text-ink-muted">({t('خلفية واسعة', 'wide banner')})</span>
            </span>
            <div className="flex items-center gap-3">
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt={form.nameAr || 'Store cover'}
                  className="h-20 w-32 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span className="flex h-20 w-32 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                  <ImagePlus size={20} />
                </span>
              )}
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Choose a store cover"
                  onChange={e => void handleCoverPicked(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverBusy}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[11px] font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
                  aria-label="Change store cover"
                >
                  {coverBusy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                  {coverSrc ? t('تغيير', 'Change') : t('إضافة', 'Add')}
                </button>
                {coverSrc && (
                  <button
                    type="button"
                    onClick={() => void handleCoverRemove()}
                    disabled={coverBusy}
                    className="flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[11px] font-bold text-ink-muted transition hover:bg-danger-tint hover:text-danger-ink active:scale-95 disabled:opacity-60"
                    aria-label="Remove store cover"
                  >
                    <X size={12} />
                    {t('إزالة', 'Remove')}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-micro text-ink-muted">
              {t('تظهر كخلفية في صفحة المتجر عند العملاء', 'Shown as the header background on the customer store page')}
            </p>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {/* Arabic name */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink">
              اسم المتجر بالعربية *
            </span>
            <input
              type="text"
              value={form.nameAr}
              onChange={e => update('nameAr', e.target.value)}
              placeholder="مثال: مطعم أبو صالح"
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

          {/* English name */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-ink">
              Store name in English
              <span className="ms-1 font-normal text-ink-muted">(optional)</span>
            </span>
            <input
              type="text"
              value={form.nameEn}
              onChange={e => update('nameEn', e.target.value)}
              placeholder="e.g. Abu Saleh Restaurant"
              dir="ltr"
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>

          {/* Phone */}
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink">
              <Phone size={12} className="text-brand" />
              {t('رقم التواصل', 'Contact phone')}
            </span>
            <input
              type="tel"
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              placeholder="05XXXXXXXX"
              dir="ltr"
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <p className="mt-1 text-micro text-ink-muted">
              {t('هذا الرقم يظهر للعميل في تفاصيل الطلب', 'Shown to customers on order details')}
            </p>
          </label>

          {/* Active status */}
          <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink">
                {t(
                  form.isActive ? 'المتجر مفتوح' : 'المتجر مغلق',
                  form.isActive ? 'Accepting orders — tap to close' : 'Not accepting orders — tap to open'
                )}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.isActive}
              onClick={() => update('isActive', !form.isActive)}
              className={`flex h-7 w-[52px] items-center rounded-full p-0.5 transition-colors duration-200 ${
                form.isActive ? 'justify-end bg-brand' : 'justify-start bg-line'
              }`}
            >
              <span className="h-6 w-6 rounded-full bg-surface shadow-card" />
            </button>
          </div>

          {/* Store location */}
          <div className="rounded-xl border border-line bg-canvas p-3">
            <span className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
              <MapPin size={13} className="text-brand" />
              {t('موقع المتجر (GPS)', 'Store location (GPS)')}
            </span>
            <p className="mb-2 text-micro text-ink-muted">
              {t(
                'يستخدمه الكابتن للملاحة إلى المتجر',
                'Used by captains to navigate to your store',
              )}
            </p>
            {coords ? (
              <p className="mb-2 rounded-lg bg-brand-tint px-2.5 py-1.5 text-micro font-semibold text-brand-deep" dir="ltr">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            ) : (
              <p className="mb-2 text-micro text-warning-ink">
                {t('لم يتم تحديد موقع المتجر بعد', 'Store location not set yet')}
              </p>
            )}
            <button
              type="button"
              onClick={() => void captureStoreLocation()}
              disabled={locBusy}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[11px] font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
            >
              {locBusy ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <MapPin size={13} />
              )}
              {t('تحديث موقع المتجر', 'Update store location')}
            </button>
            {locMessage && (
              <p className="mt-2 text-[11px] text-ink-muted" dir="auto">
                {language === 'ar' ? locMessage.ar : locMessage.en}
              </p>
            )}
          </div>

          {/* Error */}
          {saveError && (
            <p className="flex items-center gap-1.5 rounded-xl bg-danger-tint px-3 py-2 text-xs font-semibold text-danger-ink">
              <AlertTriangle size={13} className="shrink-0" /> {saveError}
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-line-soft bg-canvas px-5 py-4 flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-brand">
              <Check size={13} /> {t('تم الحفظ', 'Saved')}
            </span>
          )}
          <button
            type="button"
            onClick={handleReset}
            disabled={!dirty || saving}
            className="h-9 rounded-xl border border-line bg-surface px-4 text-xs font-bold text-ink-soft transition hover:bg-canvas disabled:opacity-40"
          >
            {t('تراجع', 'Reset')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || saving}
            className="flex h-9 items-center gap-2 rounded-xl bg-brand px-5 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t('حفظ التغييرات', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
