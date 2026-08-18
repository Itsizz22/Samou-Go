/**
 * Samou' Go — store manager catalogue management.
 *
 * Full CRUD for products: browse the live catalogue, create new items, edit
 * price / name / availability inline, and soft-deactivate products.
 * All writes go through `@samou-go/api-client` → `packages/api`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ImagePlus,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  ApiError,
  createCategory,
  createProduct,
  deleteProduct,
  removeCurrentImage,
  updateProduct,
  useStoreManager,
  useToast,
  useUploadImage,
} from '@samou-go/api-client';
import type { Product } from '@samou-go/shared-types';
import { formatCurrency } from '@/lib/delivery';
import { useLanguage } from '@samou-go/ui';

interface Props {
  /** The UUID of the store this manager owns. */
  storeId: string;
}

/* ---------------------------------------------------------------------------
 * Form state helpers
 * ------------------------------------------------------------------------- */

interface ProductFormState {
  nameAr: string;
  description: string;
  price: string;
  categoryId: string;
  isAvailable: boolean;
}

const emptyForm = (): ProductFormState => ({
  nameAr: '',
  description: '',
  price: '',
  categoryId: '',
  isAvailable: true,
});

function formFromProduct(p: Product): ProductFormState {
  return {
    nameAr: p.nameAr,
    description: p.description ?? '',
    price: String(p.price),
    categoryId: p.categoryId ?? '',
    isAvailable: p.isAvailable,
  };
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

export function ProductCataloguePanel({ storeId }: Props) {
  const toast = useToast();
  const upload = useUploadImage();
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';

  // Full catalogue including unavailable products — the manager view.
  // Uses GET /stores/:id/full (auth-gated) so unavailable products are returned.
  const catalogue = useStoreManager(storeId);
  const reload = () => void catalogue.reload();

  // Flatten all products across categories for the list view.
  const allProducts = useMemo<(Product & { categoryName: string })[]>(
    () =>
      (catalogue.data?.categories ?? []).flatMap(cat =>
        cat.products.map(p => ({ ...p, categoryName: cat.nameAr }))
      ),
    [catalogue.data]
  );

  const categories = useMemo(
    () => catalogue.data?.categories ?? [],
    [catalogue.data]
  );

  /* ---- Filter ------------------------------------------------------------ */
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const visibleProducts = useMemo(() => {
    return allProducts.filter(p => {
      if (filterCategoryId && p.categoryId !== filterCategoryId) return false;
      if (searchTerm && !p.nameAr.includes(searchTerm)) return false;
      return true;
    });
  }, [allProducts, filterCategoryId, searchTerm]);

  /* ---- Modal state ------------------------------------------------------- */
  type ModalMode = 'create' | 'edit' | null;
  const [modal, setModal] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  /* ---- Quick category creation (inside the product modal) ---------------- */
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (categoryOpen) setTimeout(() => categoryInputRef.current?.focus(), 60);
  }, [categoryOpen]);

  const handleCreateCategory = async () => {
    const name = categoryName.trim();
    if (!name || categoryBusy) return;
    setCategoryBusy(true);
    try {
      const created = await createCategory(storeId, { nameAr: name });
      toast.success('تم إنشاء القسم', `${created.nameAr} created`);
      setCategoryName('');
      setCategoryOpen(false);
      // Pull the new section into the dropdown and pre-select it for the
      // product being created/edited.
      reload();
      setForm(f => ({ ...f, categoryId: created.id }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('تعذّر إنشاء القسم', msg);
    } finally {
      setCategoryBusy(false);
    }
  };

  useEffect(() => {
    if (modal) setTimeout(() => firstInputRef.current?.focus(), 60);
  }, [modal]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm());
    setFormError(null);
    setModal('create');
  };

  const openEdit = (p: Product) => {
    setEditTarget(p);
    setForm(formFromProduct(p));
    setFormError(null);
    setModal('edit');
  };

  const closeModal = () => {
    setModal(null);
    setEditTarget(null);
    setFormError(null);
  };

  /* ---- Save (create / update) ------------------------------------------- */
  const handleSave = async () => {
    const priceNum = parseFloat(form.price);
    if (!form.nameAr.trim()) { setFormError(t('اسم المنتج مطلوب', 'Product name required')); return; }
    if (isNaN(priceNum) || priceNum <= 0) { setFormError(t('السعر غير صالح', 'Price must be a positive number')); return; }

    setSaving(true);
    setFormError(null);

    try {
      const input = {
        nameAr: form.nameAr.trim(),
        description: form.description.trim() || undefined,
        price: priceNum,
        categoryId: form.categoryId || undefined,
        isAvailable: form.isAvailable,
      };

      if (modal === 'create') {
        await createProduct(storeId, input);
        toast.success('تم إضافة المنتج', 'Product created');
        // Drop any active category filter so the fresh item is immediately
        // visible in the list instead of being hidden behind a stale filter.
        setFilterCategoryId('');
      } else if (modal === 'edit' && editTarget) {
        await updateProduct(storeId, editTarget.id, input);
        toast.success('تم تحديث المنتج', 'Product updated');
      }
      closeModal();
      reload();
    } catch (err) {
      const msg = err instanceof ApiError
        ? isArabic ? err.message : err.localizedMessage
        : err instanceof Error ? err.message : String(err);
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  /* ---- Deactivate -------------------------------------------------------- */
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const handleDeactivate = async (p: Product) => {
    if (!confirm(`إيقاف "${p.nameAr}"؟\nDeactivate "${p.nameAr}"?`)) return;
    setDeactivatingId(p.id);
    try {
      await deleteProduct(storeId, p.id);
      toast.success('تم إيقاف المنتج', `${p.nameAr} deactivated`);
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('تعذّر إيقاف المنتج', msg);
    } finally {
      setDeactivatingId(null);
    }
  };

  /* ---- Inline toggle availability --------------------------------------- */
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggleAvailability = async (p: Product) => {
    setTogglingId(p.id);
    try {
      await updateProduct(storeId, p.id, { isAvailable: !p.isAvailable });
      toast.success(
        p.isAvailable ? 'تم إيقاف المنتج مؤقتاً' : 'تم تفعيل المنتج',
        p.isAvailable ? `${p.nameAr} marked unavailable` : `${p.nameAr} marked available`
      );
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('تعذّر تغيير حالة المنتج', msg);
    } finally {
      setTogglingId(null);
    }
  };

  /* ---- Product image (attach / change / remove) -------------------------- */
  const handleProductImagePicked = async (file: File | undefined) => {
    if (!file || !editTarget) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('الملف أكبر من 8MB', 'File exceeds 8MB');
      return;
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
    setImageBusy(true);
    try {
      const result = await upload.run({ kind: 'product', resourceId: editTarget.id, file });
      if (!result) {
        toast.error(upload.error?.localizedMessage ?? 'تعذّر رفع الصورة', 'Upload failed');
        return;
      }
      setEditTarget(prev => (prev ? { ...prev, imageUrl: result.url } : prev));
      toast.success('تم تحديث صورة المنتج', 'Product image updated');
      reload();
    } finally {
      setImageBusy(false);
    }
  };

  const handleProductImageRemove = async () => {
    if (!editTarget) return;
    setImageBusy(true);
    try {
      await removeCurrentImage('product', editTarget.id);
      setEditTarget(prev => (prev ? { ...prev, imageUrl: null } : prev));
      toast.info('تمت إزالة الصورة', 'Product image removed');
      reload();
    } catch (err) {
      const msg = err instanceof ApiError ? err.localizedMessage : err instanceof Error ? err.message : String(err);
      toast.error('تعذّر إزالة الصورة', msg);
    } finally {
      setImageBusy(false);
    }
  };

  /* ---- Render ------------------------------------------------------------ */

  return (
    <div className="min-h-[60vh]">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={t('بحث', 'Search…')}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          aria-label="Search products"
        />
        <div className="relative">
          <select
            value={filterCategoryId}
            onChange={e => setFilterCategoryId(e.target.value)}
            className="h-9 appearance-none rounded-xl border border-line bg-canvas pe-8 ps-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            aria-label="Filter by category"
          >
            <option value="">{t('كل الأقسام', 'All')}</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.nameAr}</option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute end-2.5 top-2.5 text-ink-muted" />
        </div>
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
          {t('منتج جديد', 'New Product')}
        </button>
      </div>

      {/* Error */}
      {catalogue.error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-danger-tint px-4 py-3 text-xs font-semibold text-danger-ink"
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1">{isArabic ? catalogue.error.message : catalogue.error.localizedMessage}</span>
          <button
            type="button"
            onClick={reload}
            disabled={catalogue.refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-surface px-2.5 py-1 font-bold text-danger transition active:scale-95 disabled:opacity-60"
          >
            <RefreshCw size={12} className={catalogue.refreshing ? 'animate-spin' : ''} />
            إعادة المحاولة
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
      {!catalogue.loading && !catalogue.error && visibleProducts.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
            <Package size={22} />
          </span>
          <h3 className="mt-3 text-sm font-extrabold">
            {t(
              allProducts.length === 0 ? 'لا توجد منتجات في هذا المتجر' : 'لا توجد نتائج مطابقة',
              allProducts.length === 0 ? 'Add your first product using the button above' : 'Try a different search or category'
            )}
          </h3>
        </div>
      )}

      {/* Product table */}
      {!catalogue.loading && visibleProducts.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-micro font-bold uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 text-start">{t('المنتج', 'Product')}</th>
                <th className="px-3 py-3">{t('القسم', 'Category')}</th>
                <th className="px-3 py-3">{t('السعر', 'Price')}</th>
                <th className="px-3 py-3">{t('الحالة', 'Status')}</th>
                <th className="px-4 py-3 text-end">{t('إجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {visibleProducts.map(p => (
                <tr key={p.id} className={`transition hover:bg-canvas ${!p.isAvailable ? 'opacity-55' : ''}`}>
                  <td className="px-4 py-3">
                    <span className="block font-bold text-ink">{p.nameAr}</span>
                    {p.description && (
                      <span className="block max-w-[220px] truncate text-[11px] text-ink-muted">{p.description}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-[11px] text-ink-muted">{p.categoryName}</td>
                  <td className="px-3 py-3 text-center font-bold text-brand-deep" dir="ltr">
                    {formatCurrency(p.price, { unit: 'symbol' })}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleAvailability(p)}
                      disabled={togglingId === p.id}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-micro font-bold transition ${
                        p.isAvailable
                          ? 'bg-brand-tint text-brand-dark hover:bg-brand-soft'
                          : 'bg-canvas text-ink-muted hover:bg-line-soft'
                      } disabled:opacity-60`}
                      aria-label={p.isAvailable ? 'Mark unavailable' : 'Mark available'}
                    >
                      {togglingId === p.id
                        ? <Loader2 size={10} className="animate-spin" />
                        : p.isAvailable
                          ? <><Check size={10} /> متاح</>
                          : 'غير متاح'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition hover:border-brand hover:text-brand"
                        aria-label={`Edit ${p.nameAr}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeactivate(p)}
                        disabled={deactivatingId === p.id}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-danger-tint bg-surface text-danger transition hover:bg-danger-tint disabled:opacity-60"
                        aria-label={`Deactivate ${p.nameAr}`}
                      >
                        {deactivatingId === p.id
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
          aria-labelledby="product-modal-title"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-raised">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="product-modal-title" className="text-base font-extrabold text-ink">
                {t(modal === 'create' ? 'إضافة منتج جديد' : 'تعديل المنتج', modal === 'create' ? 'New Product' : 'Edit Product')}
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
              {/* Name */}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink">اسم المنتج *</span>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={form.nameAr}
                  onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
                  placeholder={t('مثال: شاورما دجاج', 'Chicken Shawarma')}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>

              {/* Description */}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink">
                  الوصف <span className="font-normal text-ink-muted">(اختياري)</span>
                </span>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="وصف قصير…"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>

              {/* Product image — attach to the existing product (edit mode) */}
              {modal === 'edit' && editTarget && (
                <div className="rounded-xl border border-line bg-canvas p-3">
                  <span className="mb-2 block text-xs font-bold text-ink">
                    {t('صورة المنتج', 'Product image')}
                  </span>
                  <div className="flex items-center gap-3">
                    {editTarget.imageUrl ? (
                      <img
                        src={editTarget.imageUrl}
                        alt={editTarget.nameAr}
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                        <Package size={20} />
                      </span>
                    )}
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        aria-label="Choose a product image"
                        onChange={e => void handleProductImagePicked(e.target.files?.[0])}
                      />
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={imageBusy}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[11px] font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
                        aria-label="Change product image"
                      >
                        {imageBusy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                        {editTarget.imageUrl ? t('تغيير', 'Change') : t('إضافة', 'Add')}
                      </button>
                      {editTarget.imageUrl && (
                        <button
                          type="button"
                          onClick={() => void handleProductImageRemove()}
                          disabled={imageBusy}
                          className="flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[11px] font-bold text-ink-muted transition hover:bg-danger-tint hover:text-danger-ink active:scale-95 disabled:opacity-60"
                          aria-label="Remove product image"
                        >
                          <X size={12} />
                          {t('إزالة', 'Remove')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Price + Category row */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-ink">السعر (₪) *</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0.00"
                    dir="ltr"
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-xs font-bold text-ink">
                    <span>القسم</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryOpen(open => !open);
                        setCategoryName('');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-surface px-2 py-1 text-[11px] font-bold text-brand-deep transition hover:bg-brand-soft"
                      aria-expanded={categoryOpen}
                      aria-label="New category"
                    >
                      {categoryOpen ? <X size={12} /> : <Plus size={12} />}
                      {t(categoryOpen ? 'إلغاء' : 'قسم جديد', categoryOpen ? 'Cancel' : 'New')}
                    </button>
                  </span>
                  <div className="relative">
                    <select
                      value={form.categoryId}
                      onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                      className="w-full appearance-none rounded-xl border border-line bg-canvas pe-7 ps-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    >
                      <option value="">بدون قسم</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.nameAr}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="pointer-events-none absolute end-2.5 top-3 text-ink-muted" />
                  </div>
                </label>
              </div>

              {/* Quick category creation — a brand-new store has zero sections,
                  so the product form must be able to mint one on the spot. */}
              {categoryOpen && (
                <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas p-2">
                  <input
                    ref={categoryInputRef}
                    type="text"
                    value={categoryName}
                    onChange={e => setCategoryName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleCreateCategory();
                      }
                    }}
                    placeholder={t('اسم القسم — مثل: ساندويشات', 'Section name')}
                    className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    aria-label="New category name"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateCategory()}
                    disabled={categoryBusy || !categoryName.trim()}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
                  >
                    {categoryBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    حفظ
                  </button>
                </div>
              )}
              {categories.length === 0 && !categoryOpen && (
                <p className="flex items-center gap-1.5 rounded-xl bg-brand-surface px-3 py-2 text-[11px] font-semibold text-brand-deep">
                  <AlertTriangle size={13} className="shrink-0" />
                  {t('لا توجد أقسام بعد — أنشئ قسماً جديداً قبل إضافة المنتجات', 'No sections yet — create one first')}
                </p>
              )}

              {/* Availability toggle */}
              <label className="flex cursor-pointer items-center gap-3">
                <span className="flex-1 text-xs font-bold text-ink">
                  {t('متاح للطلب', 'Available for orders')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isAvailable}
                  onClick={() => setForm(f => ({ ...f, isAvailable: !f.isAvailable }))}
                  className={`flex h-6 w-11 items-center rounded-full p-0.5 transition ${form.isAvailable ? 'justify-end bg-brand' : 'justify-start bg-line'}`}
                >
                  <span className="h-5 w-5 rounded-full bg-surface shadow-card" />
                </button>
              </label>

              {/* Error */}
              {formError && (
                <p className="flex items-center gap-1.5 rounded-xl bg-danger-tint px-3 py-2 text-xs font-semibold text-danger-ink">
                  <AlertTriangle size={13} className="shrink-0" />
                  {formError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="h-10 rounded-xl border border-line bg-surface text-sm font-bold text-ink-soft transition hover:bg-canvas disabled:opacity-60"
              >
                {t('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-60"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {t(modal === 'create' ? 'إضافة' : 'حفظ', modal === 'create' ? 'Add' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
