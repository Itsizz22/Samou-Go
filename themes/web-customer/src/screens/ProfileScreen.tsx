import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  ImagePlus,
  Loader2,
  LogOut,
  MapPin,
  Pencil,
  Save,
  Settings,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  SignInGate,
  useAuth,
  useToast,
  updateProfile,
  useUploadImage,
  removeCurrentImage,
} from '@/hooks/useApi';
import { ScreenShell } from '@/components/ScreenShell';
import { isValidPalestinianMobile, normalizePhone } from '@/lib/phone';
import {
  readSavedAddresses,
  writeSavedAddresses,
  type SavedAddress,
} from '@/lib/address-book';
import { ADDRESS_TAG_META, normalizeTag } from '@/lib/address-book';

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: 'عميل',
  STORE_MANAGER: 'مدير متجر',
  CAPTAIN: 'كابتن توصيل',
  ADMIN: 'مشرف',
};

/**
 * Samou' Go — `/profile`.
 *
 * Personal details (view + edit name/phone), saved delivery addresses (view +
 * delete), a shortcut to Settings and sign-out. Anonymous visitors get the
 * sign-in gate.
 */
export function ProfileScreen() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const upload = useUploadImage();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(auth.user?.name ?? '');
  const [phone, setPhone] = useState(auth.user?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[]>(() => readSavedAddresses());
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!auth.ready) {
    return (
      <ScreenShell title="الملف الشخصي" subtitle="Profile">
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-brand" aria-label="Loading" />
        </div>
      </ScreenShell>
    );
  }

  if (!auth.user) {
    return (
      <ScreenShell title="الملف الشخصي" subtitle="Profile">
        <SignInGate auth={auth} reasonAr="سجّل الدخول لإدارة حسابك" reasonEn="Sign in to manage your account" />
      </ScreenShell>
    );
  }

  const user = auth.user;

  const startEdit = () => {
    setName(user.name);
    setPhone(user.phone);
    setFieldError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setFieldError(null);
    const nextName = name.trim();
    const nextPhone = normalizePhone(phone);
    if (!nextName) {
      setFieldError('الاسم مطلوب / Name is required');
      return;
    }
    if (!nextPhone || !isValidPalestinianMobile(nextPhone)) {
      setFieldError('رقم جوال فلسطيني غير صالح / Enter a valid 05X mobile');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProfile({
        ...(nextName !== user.name ? { name: nextName } : {}),
        ...(nextPhone !== user.phone ? { phone: nextPhone } : {}),
      });
      auth.setUser(updated);
      setEditing(false);
      toast.success('تم حفظ التغييرات', 'Profile updated');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setFieldError(message);
      toast.error('تعذّر حفظ التغييرات', 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  const removeAddress = (id: string) => {
    const next = addresses.filter((entry) => entry.id !== id);
    setAddresses(next);
    writeSavedAddresses(next);
    toast.info('تم حذف العنوان', 'Address removed');
  };

  const handleAvatarPicked = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('الملف أكبر من 8MB', 'File exceeds 8MB');
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setAvatarBusy(true);
    try {
      const result = await upload.run({ kind: 'user', file });
      if (!result) {
        toast.error(upload.error?.message ?? 'تعذّر رفع الصورة', 'Upload failed');
        return;
      }
      auth.setUser(result.url ? { ...user, profileImageUrl: result.url } : user);
      toast.success('تم تحديث الصورة', 'Photo updated');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarBusy(true);
    try {
      await removeCurrentImage('user');
      auth.setUser({ ...user, profileImageUrl: null });
      toast.info('تمت إزالة الصورة', 'Photo removed');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'تعذّر إزالة الصورة', 'Could not remove photo');
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <ScreenShell title="الملف الشخصي" subtitle="Profile">
      <div className="space-y-4">
        {/* Identity */}
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center gap-3">
            {user.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={user.name}
                className="h-14 w-14 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-surface text-sm font-extrabold text-brand-deep">
                {user.name.slice(0, 2)}
              </span>
            )}
            <div className="min-w-0 flex-1 text-end">
              <h2 className="truncate text-base font-extrabold">{user.name}</h2>
              <p className="mt-0.5 text-xs text-ink-muted" dir="ltr">
                {user.phone} · {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
            <button
              type="button"
              onClick={() => (editing ? handleSave() : startEdit())}
              disabled={saving}
              aria-label={editing ? 'حفظ / Save' : 'تعديل / Edit'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : editing ? <Save size={16} /> : <Pencil size={16} />}
            </button>
          </div>

          {/* Profile photo controls */}
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
              <Camera size={16} />
            </span>
            <span className="flex-1 text-end">
              <span className="block text-xs font-extrabold">الصورة الشخصية</span>
              <span dir="ltr" className="block text-micro text-ink-muted">
                Profile photo
              </span>
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="اختر صورة شخصية / Choose a profile photo"
              onChange={(event) => void handleAvatarPicked(event.target.files?.[0])}
            />
            {avatarBusy ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-canvas text-brand">
                <Loader2 size={16} className="animate-spin" aria-label="Uploading" />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="تغيير الصورة / Change photo"
                className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3 text-[11px] font-extrabold text-white transition hover:bg-brand-dark active:scale-95"
              >
                <ImagePlus size={14} />
                تغيير <span dir="ltr">Change</span>
              </button>
            )}
            {user.profileImageUrl && !avatarBusy && (
              <button
                type="button"
                onClick={() => void handleAvatarRemove()}
                aria-label="حذف الصورة / Remove photo"
                className="flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-[11px] font-bold text-ink-muted transition hover:bg-danger-tint hover:text-danger-ink active:scale-95"
              >
                <Trash2 size={13} />
                <span dir="ltr">Remove</span>
              </button>
            )}
          </div>

          {editing ? (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <label className="block">
                <span className="text-[11px] font-bold text-ink-muted">الاسم الكامل / Full name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="input-field mt-1.5"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-ink-muted">رقم الجوال / Mobile</span>
                <input
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="input-field mt-1.5"
                />
              </label>
              {fieldError && (
                <p className="rounded-xl bg-danger-tint px-3 py-2 text-[11px] font-semibold text-danger-ink" role="alert">
                  {fieldError}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-xs font-bold text-ink-muted transition active:scale-[0.98]"
                >
                  <X size={14} /> إلغاء <span dir="ltr">Cancel</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  حفظ <span dir="ltr">Save</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-canvas p-3 text-center">
              <div>
                <p className="text-micro text-ink-muted">الحالة / Status</p>
                <p className="mt-0.5 text-xs font-extrabold text-ink">
                  {user.isActive ? 'نشط' : 'موقوف'} <span dir="ltr" className="text-micro">{user.isActive ? 'Active' : 'Inactive'}</span>
                </p>
              </div>
              <div>
                <p className="text-micro text-ink-muted">المعرّف / ID</p>
                <p className="mt-0.5 truncate text-xs font-extrabold text-ink" dir="ltr">
                  {user.id.slice(0, 12)}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Saved addresses */}
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
              <MapPin size={18} />
            </span>
            <div className="flex-1 text-end">
              <h2 className="text-sm font-extrabold">العناوين المحفوظة</h2>
              <p dir="ltr" className="text-[11px] text-ink-muted">
                Saved addresses
              </p>
            </div>
          </div>

          {addresses.length === 0 ? (
            <p className="mt-4 rounded-xl bg-canvas px-3 py-4 text-center text-[11px] text-ink-muted">
              لا توجد عناوين محفوظة — تُحفظ العناوين تلقائياً عند تأكيد طلبك في الخلاصة
              <span dir="ltr" className="ms-1">No saved addresses yet</span>
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {addresses.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 rounded-xl bg-canvas p-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-dark">
                    <MapPin size={13} />
                  </span>
                  <div className="min-w-0 flex-1 text-end">
                    <p className="flex items-center justify-end gap-1.5">
                      <span className="truncate text-xs font-extrabold text-ink">{entry.label || entry.addressText.slice(0, 24)}</span>
                      {entry.tag && (
                        <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-micro font-bold text-brand-dark">
                          {ADDRESS_TAG_META[normalizeTag(entry.tag)].ar}
                          <span dir="ltr" className="ms-1">{ADDRESS_TAG_META[normalizeTag(entry.tag)].en}</span>
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{entry.addressText}</p>
                    {entry.addressNote && (
                      <p className="mt-0.5 text-micro text-ink-muted">{entry.addressNote}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="حذف العنوان / Remove address"
                    onClick={() => removeAddress(entry.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition hover:bg-danger-tint hover:text-danger-ink"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Settings shortcut */}
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-end shadow-card transition hover:bg-brand-surface active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-dark">
            <Settings size={18} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-extrabold">الإعدادات</span>
            <span dir="ltr" className="block text-[11px] text-ink-muted">
              Settings — theme, language, notifications
            </span>
          </span>
        </button>

        {/* Sign out */}
        <button
          type="button"
          onClick={auth.signOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger-tint bg-danger-tint/40 px-4 py-3 text-xs font-extrabold text-danger-ink transition hover:bg-danger-tint active:scale-[0.98]"
        >
          <LogOut size={15} />
          تسجيل الخروج <span dir="ltr" className="font-medium text-danger/70">Sign out</span>
        </button>
      </div>
    </ScreenShell>
  );
}