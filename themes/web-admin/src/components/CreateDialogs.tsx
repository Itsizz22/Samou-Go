/**
 * Samou' Go — Admin creation dialogs.
 *
 * "Add New Store" and "Add New Captain" open these dialogs. Each dialog posts
 * to the matching admin endpoint (`POST /admin/stores`, `POST /admin/captains`)
 * and only reports success once the server has created the account. The forms
 * reuse the shared `.input-field` primitive so widths/radii stay consistent
 * with the rest of the dashboard.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { useCreateCaptain, useCreateStore, useStores, useToast } from '@/hooks/useApi';
import type { AdminCreateCaptainInput, AdminCreateStoreInput } from '@samou-go/shared-types';

/* ---------------------------------------------------------------------------
 * Shared modal shell
 * ------------------------------------------------------------------------- */

function AdminModal({
  title,
  en,
  onClose,
  children,
}: {
  title: string;
  en: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface shadow-raised"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-sm font-extrabold">{title}</h2>
            <p dir="ltr" className="mt-0.5 text-[11px] text-ink-muted">
              {en}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-ink-muted transition hover:bg-canvas"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold text-ink-soft">{children}</span>
      {hint ? (
        <span dir="ltr" className="mb-1.5 block text-[10px] text-ink-subtle">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  labelAr,
  labelEn,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelAr: string;
  labelEn: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5 text-start"
    >
      <span className="text-[11px] font-bold text-ink-soft">
        {labelAr}{' '}
        <span dir="ltr" className="font-medium text-ink-subtle">
          · {labelEn}
        </span>
      </span>
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition-colors ${checked ? 'justify-end bg-brand' : 'justify-start bg-line'}`}
      >
        <span className="h-4 w-4 rounded-full bg-white" />
      </span>
    </button>
  );
}

const inputClass = 'input-field';
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-brand transition hover:bg-brand-dark active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:pointer-events-none disabled:opacity-50';

/* ---------------------------------------------------------------------------
 * Shared confirmation dialog — destructive actions (delete/deactivate)
 * ------------------------------------------------------------------------- */

export function ConfirmDialog({
  open,
  title,
  en,
  message,
  confirmLabelAr,
  confirmLabelEn,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  en: string;
  message: string;
  confirmLabelAr: string;
  confirmLabelEn: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <AdminModal title={title} en={en} onClose={onClose}>
      <div className="p-6">
        <p className="text-sm leading-relaxed text-ink-soft">{message}</p>
        <p dir="ltr" className="mt-2 text-[11px] leading-relaxed text-ink-subtle">
          This action cannot be undone.
        </p>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-bold text-ink-soft transition hover:border-brand hover:bg-brand-surface disabled:opacity-50"
        >
          إلغاء <span dir="ltr" className="font-medium">Cancel</span>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger-ink px-4 py-3 text-sm font-bold text-white transition hover:bg-danger active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-danger/40 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          {confirmLabelAr}{' '}
          <span dir="ltr" className="font-medium">
            {confirmLabelEn}
          </span>
        </button>
      </footer>
    </AdminModal>
  );
}

/* ---------------------------------------------------------------------------
 * Add New Store
 * ------------------------------------------------------------------------- */

export function CreateStoreDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const create = useCreateStore();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [phone, setPhone] = useState('');
  const [managerName, setManagerName] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  if (!open) return null;

  const submit = async () => {
    if (!nameAr.trim() || !nameEn.trim() || !phone.trim()) {
      toast.error('أكمل الحقول المطلوبة', 'Please complete all required fields');
      return;
    }
    if (password && password.length < 8) {
      toast.error('كلمة المرور 8 أحرف على الأقل', 'Password must be at least 8 characters');
      return;
    }
    const input: AdminCreateStoreInput = {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim(),
      phone: phone.trim(),
      isActive,
      ...(managerName.trim() ? { managerName: managerName.trim() } : {}),
      ...(password ? { password } : {}),
    };
    const result = await create.run(input);
    if (result) {
      toast.success(
        `تم إنشاء المتجر «${result.store.nameAr}»`,
        `Store "${result.store.nameEn}" created`
      );
      setResetKey(k => k + 1);
      setNameAr('');
      setNameEn('');
      setPhone('');
      setManagerName('');
      setPassword('');
      setIsActive(true);
      onCreated();
      onClose();
    } else {
      toast.error('تعذّر إنشاء المتجر', create.error?.message ?? 'Create failed', {
        duration: 5_000,
      });
    }
  };

  return (
    <AdminModal title="إضافة متجر جديد" en="Add New Store" onClose={onClose}>
      <div key={resetKey} className="grid gap-4 p-6">
        <FieldLabel hint="Arabic name">
          <input
            className={inputClass}
            dir="rtl"
            value={nameAr}
            onChange={e => setNameAr(e.target.value)}
            placeholder="الاسم العربي"
            aria-label="Store Arabic name"
          />
        </FieldLabel>
        <FieldLabel hint="English name">
          <input
            className={inputClass}
            dir="ltr"
            value={nameEn}
            onChange={e => setNameEn(e.target.value)}
            placeholder="English name"
            aria-label="Store English name"
          />
        </FieldLabel>
        <FieldLabel hint="05XXXXXXXX">
          <input
            className={inputClass}
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="رقم الجوال / Phone"
            aria-label="Store phone"
          />
        </FieldLabel>
        <FieldLabel hint="Manager display name (optional)">
          <input
            className={inputClass}
            dir="rtl"
            value={managerName}
            onChange={e => setManagerName(e.target.value)}
            placeholder="اسم مدير المتجر"
            aria-label="Manager name"
          />
        </FieldLabel>
        <FieldLabel hint="Owner login password — 8+ characters (optional)">
          <input
            className={inputClass}
            dir="ltr"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="كلمة مرور المدير / Owner password"
            aria-label="Store owner password"
          />
        </FieldLabel>
        <ToggleSwitch
          checked={isActive}
          onChange={setIsActive}
          labelAr="المتجر مفتوح"
          labelEn="Store open"
        />
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-bold text-ink-soft transition hover:border-brand hover:bg-brand-surface"
        >
          إلغاء
        </button>
        <button
          type="button"
          disabled={create.pending}
          onClick={() => void submit()}
          className={buttonClass}
        >
          {create.pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          إنشاء المتجر{' '}
          <span dir="ltr" className="font-medium">
            Create store
          </span>
        </button>
      </footer>
    </AdminModal>
  );
}

/* ---------------------------------------------------------------------------
 * Add New Captain
 * ------------------------------------------------------------------------- */

export function CreateCaptainDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const create = useCreateCaptain();
  const stores = useStores({ activeOnly: false, page: 1, pageSize: 100 });
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [phone, setPhone] = useState('');
  const [assignedStoreId, setAssignedStoreId] = useState('');
  const [password, setPassword] = useState('');
  const [isVerified, setIsVerified] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!nameAr.trim() || !nameEn.trim() || !phone.trim() || !assignedStoreId) {
      toast.error('أكمل الحقول المطلوبة', 'Please complete all required fields');
      return;
    }
    if (password && password.length < 8) {
      toast.error('كلمة المرور 8 أحرف على الأقل', 'Password must be at least 8 characters');
      return;
    }
    const input: AdminCreateCaptainInput = {
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim(),
      phone: phone.trim(),
      assignedStoreId,
      isVerified,
      ...(password ? { password } : {}),
    };
    const result = await create.run(input);
    if (result) {
      toast.success(`تم إنشاء السائق «${result.name}»`, `Captain "${result.name}" created`);
      setNameAr('');
      setNameEn('');
      setPhone('');
      setAssignedStoreId('');
      setPassword('');
      setIsVerified(false);
      onCreated();
      onClose();
    } else {
      toast.error('تعذّر إنشاء السائق', create.error?.message ?? 'Create failed', {
        duration: 5_000,
      });
    }
  };

  return (
    <AdminModal title="إضافة سائق جديد" en="Add New Driver" onClose={onClose}>
      <div className="grid gap-4 p-6">
        <FieldLabel hint="Arabic name">
          <input
            className={inputClass}
            dir="rtl"
            value={nameAr}
            onChange={e => setNameAr(e.target.value)}
            placeholder="الاسم العربي"
            aria-label="Captain Arabic name"
          />
        </FieldLabel>
        <FieldLabel hint="English name">
          <input
            className={inputClass}
            dir="ltr"
            value={nameEn}
            onChange={e => setNameEn(e.target.value)}
            placeholder="English name"
            aria-label="Captain English name"
          />
        </FieldLabel>
        <FieldLabel hint="05XXXXXXXX">
          <input
            className={inputClass}
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="رقم الجوال / Phone"
            aria-label="Captain phone"
          />
        </FieldLabel>
        <FieldLabel hint="Dedicated store">
          <select
            value={assignedStoreId}
            onChange={e => setAssignedStoreId(e.target.value)}
            className="input-field cursor-pointer"
            aria-label="Assigned store"
          >
            <option value="">اختر المتجر / Select a store</option>
            {(stores.data?.items ?? []).map(store => (
              <option key={store.id} value={store.id}>
                {store.nameAr}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel hint="Driver login password — 8+ characters (optional)">
          <input
            className={inputClass}
            dir="ltr"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="كلمة مرور السائق / Driver password"
            aria-label="Driver password"
          />
        </FieldLabel>
        <ToggleSwitch
          checked={isVerified}
          onChange={setIsVerified}
          labelAr="موثّق فوراً"
          labelEn="Verified on creation"
        />
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-bold text-ink-soft transition hover:border-brand hover:bg-brand-surface"
        >
          إلغاء
        </button>
        <button
          type="button"
          disabled={create.pending}
          onClick={() => void submit()}
          className={buttonClass}
        >
          {create.pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          إنشاء السائق{' '}
          <span dir="ltr" className="font-medium">
            Create driver
          </span>
        </button>
      </footer>
    </AdminModal>
  );
}
