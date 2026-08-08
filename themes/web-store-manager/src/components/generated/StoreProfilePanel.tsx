/**
 * Samou' Go — store profile management panel.
 *
 * Lets the store manager update their store's name, phone number, and
 * active/open status. Writes go through `PATCH /api/v1/stores/:id`.
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Loader2,
  Phone,
  RefreshCw,
  Store,
} from 'lucide-react';
import { updateStore, useStore, useToast } from '@samou-go/api-client';
import type { Store as StoreType } from '@samou-go/shared-types';

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

  // Load just this store's header data for the form.
  // useStore hits GET /stores/:id (public) which includes phone, nameAr, nameEn, isActive.
  const storeResource = useStore(storeId);
  const storeData = storeResource.data ?? null;

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
    if (!form.nameAr.trim()) { setSaveError('اسم المتجر مطلوب / Store name required'); return; }
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
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!storeData) return;
    setForm(formFromStore(storeData));
    setDirty(false);
    setSaveError(null);
  };

  if (storeResource.loading) {
    return (
      <div className="space-y-4" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-surface shadow-card" />
        ))}
      </div>
    );
  }

  if (storeResource.error) {
    return (
      <div className="rounded-xl border border-danger-tint bg-surface p-5 text-center shadow-card">
        <AlertTriangle className="mx-auto text-danger" size={22} />
        <p className="mt-2 text-sm font-bold text-danger-ink">{storeResource.error.message}</p>
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

  return (
    <div dir="rtl" className="mx-auto max-w-lg">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {/* Store ID badge */}
        <div className="border-b border-line-soft bg-canvas px-5 py-3 flex items-center gap-2">
          <Store size={15} className="text-brand" />
          <span className="text-[11px] font-semibold text-ink-muted" dir="ltr">
            Store ID: {storeId}
          </span>
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
              رقم التواصل
              <span className="font-normal text-ink-muted" dir="ltr">/ Contact phone</span>
            </span>
            <input
              type="tel"
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              placeholder="05XXXXXXXX"
              dir="ltr"
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <p className="mt-1 text-[10px] text-ink-subtle">
              هذا الرقم يظهر للعميل في تفاصيل الطلب / Shown to customers on order details
            </p>
          </label>

          {/* Active status */}
          <div className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink">
                {form.isActive ? 'المتجر مفتوح' : 'المتجر مغلق'}
              </p>
              <p className="text-[11px] text-ink-muted" dir="ltr">
                {form.isActive
                  ? 'Accepting orders — tap to close'
                  : 'Not accepting orders — tap to open'}
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
              <Check size={13} /> تم الحفظ / Saved
            </span>
          )}
          <button
            type="button"
            onClick={handleReset}
            disabled={!dirty || saving}
            className="h-9 rounded-xl border border-line bg-surface px-4 text-xs font-bold text-ink-soft transition hover:bg-canvas disabled:opacity-40"
          >
            تراجع / Reset
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || saving}
            className="flex h-9 items-center gap-2 rounded-xl bg-brand px-5 text-xs font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            حفظ التغييرات <span dir="ltr" className="font-medium opacity-80">/ Save</span>
          </button>
        </div>
      </div>
    </div>
  );
}
