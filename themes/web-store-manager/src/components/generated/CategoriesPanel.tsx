/**
 * Samou' Go — store manager menu-sections (categories) management.
 *
 * Full CRUD for the store's menu sections: browse, create, rename, reorder
 * (`sortOrder`), and delete. Writes go through `@samou-go/api-client` →
 * `packages/api` (PATCH /stores/:id/categories/:categoryId added for this
 * panel). Deleting a section is destructive server-side: products in it are
 * unlinked (`categoryId → null`), never deleted — the confirm dialog says so.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ApiError,
  createCategory,
  deleteCategory,
  updateCategory,
  useStoreManager,
  useToast,
} from '@samou-go/api-client';
import type { Category } from '@samou-go/shared-types';
import { useLanguage } from '@samou-go/ui';

interface Props {
  /** The UUID of the store this manager owns. */
  storeId: string;
}

/* ---------------------------------------------------------------------------
 * Form state helpers
 * ------------------------------------------------------------------------- */

interface CategoryFormState {
  nameAr: string;
  nameEn: string;
  imageUrl: string;
  sortOrder: string;
}

const emptyForm = (): CategoryFormState => ({ nameAr: '', nameEn: '', imageUrl: '', sortOrder: '' });

function formFromCategory(c: Category): CategoryFormState {
  return { nameAr: c.nameAr, nameEn: c.nameEn, imageUrl: c.imageUrl ?? '', sortOrder: String(c.sortOrder) };
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

export function CategoriesPanel({ storeId }: Props) {
  const toast = useToast();
  const { t, language } = useLanguage();

  // Same auth-gated full-catalogue resource as the product panel — categories
  // arrive with their products inlined, so per-section product counts are free.
  const catalogue = useStoreManager(storeId);
  const reload = () => void catalogue.reload();

  const categories = useMemo(
    () => [...(catalogue.data?.categories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [catalogue.data]
  );

  /* ---- Modal state ------------------------------------------------------- */
  type ModalMode = 'create' | 'edit' | null;
  const [modal, setModal] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    if (modal) setTimeout(() => firstInputRef.current?.focus(), 60);
  }, [modal]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...emptyForm(), sortOrder: String(Math.max(0, ...categories.map(c => c.sortOrder)) + 1) });
    setFormError(null);
    setImagePreview(null);
    setImageFile(null);
    setModal('create');
  };

  const openEdit = (c: Category) => {
    setEditTarget(c);
    setForm(formFromCategory(c));
    setFormError(null);
    setImagePreview(c.imageUrl ?? null);
    setImageFile(null);
    setModal('edit');
  };

  const closeModal = () => {
    setModal(null);
    setEditTarget(null);
    setFormError(null);
    setImagePreview(null);
    setImageFile(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validate file type
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setFormError(t('يرجى اختيار صورة JPEG أو PNG أو WebP', 'Please select a JPEG, PNG, or WebP image'));
      return;
    }
    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      setFormError(t('حجم الصورة يجب أن يكون أقل من 2 ميغابايت', 'Image size must be under 2MB'));
      return;
    }
    setImageFile(file);
    setFormError(null);
    // Create preview URL
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  /* ---- Save (create / update) ------------------------------------------- */
  const handleSave = async () => {
    const nameAr = form.nameAr.trim();
    if (!nameAr) { setFormError(t('اسم القسم مطلوب', 'Section name required')); return; }
    const sortOrder = form.sortOrder.trim() === '' ? undefined : Number(form.sortOrder);
    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999)) {
      setFormError(t('ترتيب القسم يجب أن يكون عدداً صحيحاً من 0 إلى 9999', 'Sort order must be an integer from 0 to 9999'));
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      // If a new file was selected, upload it first to get a URL.
      let finalImageUrl = form.imageUrl.trim() || undefined;
      if (imageFile) {
        const { presignUpload, uploadRawFile, finalizeUpload } = await import('@samou-go/api-client');
        const presign = await presignUpload({ kind: 'category', resourceId: editTarget?.id ?? 'new', purpose: 'image', contentType: imageFile.type });
        await uploadRawFile(presign.key, imageFile);
        await finalizeUpload(presign.key, 'category');
        finalImageUrl = presign.url;
      }

      if (modal === 'create') {
        await createCategory(storeId, {
          nameAr,
          nameEn: form.nameEn.trim() || undefined,
          imageUrl: finalImageUrl,
          sortOrder,
        });
        toast.success('تم إنشاء القسم', 'Section created');
      } else if (modal === 'edit' && editTarget) {
        await updateCategory(storeId, editTarget.id, {
          nameAr,
          nameEn: form.nameEn.trim() || undefined,
          imageUrl: finalImageUrl ?? null,
          sortOrder,
        });
        toast.success('تم تحديث القسم', 'Section updated');
      }
      closeModal();
      reload();
    } catch (err) {
      const msg = err instanceof ApiError
        ? language === 'ar' ? err.message : err.localizedMessage
        : err instanceof Error ? err.message : String(err);
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  /* ---- Reorder: renumber every section by list position ------------------ */
  const [reordering, setReordering] = useState(false);

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length || reordering) return;
    setReordering(true);
    try {
      const reordered = [...categories];
      [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
      // Sequential 0..n-1 values — ties (seed rows all have sortOrder 0) are
      // resolved in the same pass, so the arrows always visibly move a row.
      await Promise.all(
        reordered.map((c, i) =>
          c.sortOrder !== i
            ? updateCategory(storeId, c.id, { sortOrder: i })
            : Promise.resolve()
        )
      );
      toast.success('تم حفظ الترتيب', 'Order saved');
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('تعذّر حفظ الترتيب', msg);
    } finally {
      setReordering(false);
    }
  };

  /* ---- Delete (destructive: products get unlinked, not deleted) ---------- */
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (c: Category) => {
    const ok = confirm(
      `${t('حذف القسم', 'Delete section')} "${c.nameAr}"؟\n` +
      t(
        'المنتجات الموجودة فيه ستبقى بدون قسم (لن تُحذف). هل تريد المتابعة؟',
        'Its products will become uncategorized (not deleted). Continue?'
      )
    );
    if (!ok) return;
    setDeletingId(c.id);
    try {
      await deleteCategory(storeId, c.id);
      toast.success('تم حذف القسم', 'Section deleted');
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('تعذّر حذف القسم', msg);
    } finally {
      setDeletingId(null);
    }
  };

  /* ---- Render ------------------------------------------------------------ */

  return (
    <div className="min-h-[60vh]">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold text-ink-muted">
          {t('الأقسام هي أقسام القائمة التي تظهر للعملاء', 'Sections are the menu groups your customers see')}
        </span>
        <button
          type="button"
          onClick={reload}
          disabled={catalogue.refreshing}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 text-xs font-bold text-ink-soft transition hover:bg-brand-surface disabled:opacity-60"
          aria-label="Refresh"
        >
          <RefreshCw size={14} className={catalogue.refreshing ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-4 text-xs font-bold text-white transition hover:bg-brand-dark"
        >
          <Plus size={15} />
          {t('قسم جديد', 'New Section')}
        </button>
      </div>

      {/* Error */}
      {catalogue.error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-danger-tint px-4 py-3 text-xs font-semibold text-danger-ink"
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1">{language === 'ar' ? catalogue.error.message : catalogue.error.localizedMessage}</span>
          <button
            type="button"
            onClick={reload}
            disabled={catalogue.refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-surface px-2.5 py-1 font-bold text-danger transition active:scale-95 disabled:opacity-60"
          >
            <RefreshCw size={12} className={catalogue.refreshing ? 'animate-spin' : ''} />
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </div>
      )}

      {/* Loading skeletons */}
      {catalogue.loading && (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="skeleton h-14 rounded-xl shadow-card" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!catalogue.loading && !catalogue.error && categories.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
            <FolderOpen size={22} />
          </span>
          <h3 className="mt-3 text-sm font-extrabold">
            {t('لا توجد أقسام بعد', 'No sections yet')}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            {t('أنشئ أول قسم ثم أضف المنتجات إليه', 'Create your first section, then add products to it')}
          </p>
        </div>
      )}

      {/* Section list */}
      {!catalogue.loading && categories.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-micro font-bold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 text-start">{t('القسم', 'Section')}</th>
                <th className="px-3 py-3">{t('المنتجات', 'Products')}</th>
                <th className="px-3 py-3">{t('الترتيب', 'Order')}</th>
                <th className="px-4 py-3 text-end">{t('إجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {categories.map((c, index) => (
                <tr key={c.id} className="transition hover:bg-canvas">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {c.imageUrl ? (
                        <img
                          src={c.imageUrl}
                          alt={c.nameAr}
                          className="h-10 w-10 shrink-0 rounded-xl object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-surface text-brand">
                          <ImageIcon size={16} />
                        </span>
                      )}
                      <div>
                        <span className="block font-bold text-ink">{c.nameAr}</span>
                        <span className="block text-[11px] text-ink-muted" dir="ltr">
                          {c.nameEn}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-micro font-bold text-brand-dark">
                      {c.products.length}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-[11px] text-ink-muted" dir="ltr">
                    {c.sortOrder}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleMove(index, -1)}
                          disabled={index === 0 || reordering}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition hover:border-brand hover:text-brand disabled:opacity-40"
                          aria-label={`Move ${c.nameAr} up`}
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMove(index, 1)}
                          disabled={index === categories.length - 1 || reordering}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition hover:border-brand hover:text-brand disabled:opacity-40"
                          aria-label={`Move ${c.nameAr} down`}
                        >
                          <ArrowDown size={13} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition hover:border-brand hover:text-brand"
                        aria-label={`Edit ${c.nameAr}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(c)}
                        disabled={deletingId === c.id}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-danger-tint bg-surface text-danger transition hover:bg-danger-tint disabled:opacity-60"
                        aria-label={`Delete ${c.nameAr}`}
                      >
                        {deletingId === c.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Trash2 size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="category-modal-title"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-raised">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="category-modal-title" className="text-base font-extrabold text-ink">
                {t(modal === 'create' ? 'إضافة قسم جديد' : 'تعديل القسم', modal === 'create' ? 'New Section' : 'Edit Section')}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-ink-muted transition hover:bg-canvas"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Arabic name */}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink">{t('اسم القسم (عربي) *', 'Section name (Arabic) *')}</span>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={form.nameAr}
                  onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
                  placeholder={t('مثال: مشروبات', 'Drinks')}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>

              {/* English name */}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink">
                  {t('الاسم باللاتينية', 'Latin name')} <span className="font-normal text-ink-muted">({t('اختياري', 'optional')})</span>
                </span>
                <input
                  type="text"
                  value={form.nameEn}
                  onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                  placeholder="drinks"
                  dir="ltr"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <span className="mt-1 block text-[11px] text-ink-muted">
                  {t('يُترك فارغاً ليتم توليده تلقائياً. يجب أن يكون فريداً داخل المتجر.', 'Leave empty to auto-generate. Must be unique within the store.')}
                </span>
              </label>

              {/* Image upload */}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink">
                  {t('صورة القسم', 'Section image')} <span className="font-normal text-ink-muted">({t('اختياري', 'optional')})</span>
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="relative mt-1">
                    <img
                      src={imagePreview}
                      alt={t('معاينة الصورة', 'Image preview')}
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => { setImagePreview(null); setImageFile(null); setForm(f => ({ ...f, imageUrl: '' })); }}
                      className="absolute -top-2 -start-2 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-canvas px-4 py-6 text-ink-muted transition hover:border-brand hover:bg-brand-surface"
                  >
                    <Upload size={18} />
                    <span className="text-xs font-bold">{t('اختر صورة', 'Choose image')}</span>
                  </button>
                )}
                <span className="mt-1 block text-[11px] text-ink-muted">
                  {t('JPEG أو PNG أو WebP — حد أقصى 2 ميغابايت', 'JPEG, PNG, or WebP — max 2MB')}
                </span>
              </label>

              {/* Sort order */}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink">
                  {t('الترتيب', 'Sort order')} <span className="font-normal text-ink-muted">({t('اختياري', 'optional')})</span>
                </span>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  step="1"
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                  placeholder="0"
                  dir="ltr"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <span className="mt-1 block text-[11px] text-ink-muted">
                  {t('الأرقام الأصغر تظهر أولاً. يمكنك أيضاً استخدام أسهم الترتيب.', 'Lower numbers appear first. The up/down arrows do this for you.')}
                </span>
              </label>

              {/* Form error */}
              {formError && (
                <div role="alert" className="rounded-xl bg-danger-tint px-3 py-2.5 text-xs font-semibold text-danger-ink">
                  {formError}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-4 text-xs font-bold text-ink-soft transition hover:bg-canvas active:scale-95 disabled:opacity-60"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-4 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {t(modal === 'create' ? 'إنشاء' : 'حفظ', modal === 'create' ? 'Create' : 'Save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}