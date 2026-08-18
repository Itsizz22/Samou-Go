/**
 * Samou' Go — store manager offers (marketing banners) management.
 *
 * Full CRUD for the store's promotional offers: browse, create, edit, toggle
 * active state, attach/detach products, upload a banner image, and delete.
 * An offer with no attached products is store-wide; with products attached it
 * targets only those specific items (shown as a badge on the product card).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ImagePlus,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  ApiError,
  createOffer,
  deleteOffer,
  removeCurrentImage,
  toggleOffer,
  updateOffer,
  useStoreManager,
  useStoreOffers,
  useToast,
  useUploadImage,
} from '@samou-go/api-client';
import type { Offer, Product } from '@samou-go/shared-types';
import { useLanguage } from '@samou-go/ui';

interface Props {
  storeId: string;
}

/* ---------------------------------------------------------------------------
 * Form state helpers
 * ------------------------------------------------------------------------- */

interface OfferFormState {
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  startsAt: string;
  expiresAt: string;
  sortOrder: string;
  productIds: string[];
}

const emptyForm = (): OfferFormState => ({
  titleAr: '',
  titleEn: '',
  descriptionAr: '',
  descriptionEn: '',
  startsAt: '',
  expiresAt: '',
  sortOrder: '',
  productIds: [],
});

function formFromOffer(o: Offer): OfferFormState {
  return {
    titleAr: o.titleAr,
    titleEn: o.titleEn,
    descriptionAr: o.descriptionAr,
    descriptionEn: o.descriptionEn,
    startsAt: o.startsAt ? o.startsAt.slice(0, 16) : '',
    expiresAt: o.expiresAt ? o.expiresAt.slice(0, 16) : '',
    sortOrder: String(o.sortOrder),
    productIds: o.productIds ?? [],
  };
}

function toLocalDatetime(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

export function OffersPanel({ storeId }: Props) {
  const toast = useToast();
  const upload = useUploadImage();
  const { t, language } = useLanguage();

  const offers = useStoreOffers(storeId);
  const catalogue = useStoreManager(storeId);
  const reload = () => void offers.reload();

  const allProducts = useMemo(
    () =>
      (catalogue.data?.categories ?? []).flatMap(cat =>
        cat.products.map(p => ({ ...p, categoryName: cat.nameAr }))
      ),
    [catalogue.data]
  );

  /* ---- Modal state ------------------------------------------------------- */
  type ModalMode = 'create' | 'edit' | null;
  const [modal, setModal] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<Offer | null>(null);
  const [form, setForm] = useState<OfferFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modal) setTimeout(() => firstInputRef.current?.focus(), 60);
  }, [modal]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...emptyForm(), sortOrder: String(Math.max(0, ...(offers.data?.items ?? []).map(o => o.sortOrder)) + 1) });
    setFormError(null);
    setModal('create');
  };

  const openEdit = (o: Offer) => {
    setEditTarget(o);
    setForm(formFromOffer(o));
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
    const titleAr = form.titleAr.trim();
    const titleEn = form.titleEn.trim();
    const descAr = form.descriptionAr.trim();
    const descEn = form.descriptionEn.trim();
    if (!titleAr) { setFormError(t('عنوان العرض بالعربية مطلوب', 'Arabic title required')); return; }
    if (!titleEn) { setFormError(t('English title required', 'English title required')); return; }
    if (!descAr) { setFormError(t('وصف العرض بالعربية مطلوب', 'Arabic description required')); return; }
    if (!descEn) { setFormError(t('English description required', 'English description required')); return; }

    const sortOrder = form.sortOrder.trim() === '' ? undefined : Number(form.sortOrder);
    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999)) {
      setFormError(t('الترتيب يجب أن عدداً من 0 إلى 999', 'Sort order must be 0–999'));
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const input = {
        titleAr,
        titleEn,
        descriptionAr: descAr,
        descriptionEn: descEn,
        startsAt: form.startsAt || undefined,
        expiresAt: form.expiresAt || undefined,
        sortOrder,
        productIds: form.productIds.length > 0 ? form.productIds : undefined,
      };

      if (modal === 'create') {
        const created = await createOffer(storeId, input);
        // Upload image if one was picked (create mode has no editTarget yet)
        if (imageInputRef.current?.files?.[0]) {
          await upload.run({ kind: 'offer', resourceId: created.id, file: imageInputRef.current.files[0] });
          if (imageInputRef.current) imageInputRef.current.value = '';
        }
        toast.success('تم إنشاء العرض', 'Offer created');
      } else if (modal === 'edit' && editTarget) {
        await updateOffer(storeId, editTarget.id, input);
        toast.success('تم تحديث العرض', 'Offer updated');
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

  /* ---- Toggle active state ------------------------------------------------ */
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggle = async (o: Offer) => {
    setTogglingId(o.id);
    try {
      await toggleOffer(storeId, o.id);
      toast.success(
        o.isActive ? 'تم إخفاء العرض' : 'تم تفعيل العرض',
        o.isActive ? 'Offer deactivated' : 'Offer activated'
      );
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('تعذّر تغيير حالة العرض', msg);
    } finally {
      setTogglingId(null);
    }
  };

  /* ---- Delete ------------------------------------------------------------ */
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (o: Offer) => {
    const ok = confirm(
      `${t('حذف العرض', 'Delete offer')} "${o.titleAr}"؟\n` +
      t('لا يمكن التراجع عن هذا الإجراء.', 'This cannot be undone.')
    );
    if (!ok) return;
    setDeletingId(o.id);
    try {
      await deleteOffer(storeId, o.id);
      toast.success('تم حذف العرض', 'Offer deleted');
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('تعذّر حذف العرض', msg);
    } finally {
      setDeletingId(null);
    }
  };

  /* ---- Image upload (edit mode) ------------------------------------------ */
  const handleImagePicked = async (file: File | undefined) => {
    if (!file || !editTarget) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('الملف أكبر من 8MB', 'File exceeds 8MB');
      return;
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
    setImageBusy(true);
    try {
      const result = await upload.run({ kind: 'offer', resourceId: editTarget.id, file });
      if (!result) {
        toast.error(upload.error?.message ?? 'تعذّر رفع الصورة', 'Upload failed');
        return;
      }
      setEditTarget(prev => (prev ? { ...prev, imageUrl: result.url } : prev));
      toast.success('تم تحديث صورة العرض', 'Offer image updated');
      reload();
    } finally {
      setImageBusy(false);
    }
  };

  const handleImageRemove = async () => {
    if (!editTarget) return;
    setImageBusy(true);
    try {
      await removeCurrentImage('offer', editTarget.id);
      setEditTarget(prev => (prev ? { ...prev, imageUrl: null } : prev));
      toast.info('تمت إزالة الصورة', 'Image removed');
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('تعذّر إزالة الصورة', msg);
    } finally {
      setImageBusy(false);
    }
  };

  /* ---- Product multi-select helpers -------------------------------------- */
  const toggleProduct = (productId: string) => {
    setForm(f => ({
      ...f,
      productIds: f.productIds.includes(productId)
        ? f.productIds.filter(id => id !== productId)
        : [...f.productIds, productId],
    }));
  };

  /* ---- Render ------------------------------------------------------------ */
  const offerList = offers.data?.items ?? [];

  return (
    <div className="min-h-[60vh]">
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold text-ink-muted">
          {t('العروض الترويجية التي تظهر للعملاء', 'Promotional banners visible to customers')}
        </span>
        <button
          type="button"
          onClick={reload}
          disabled={offers.refreshing}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 text-xs font-bold text-ink-soft transition hover:bg-brand-surface disabled:opacity-60"
          aria-label="Refresh"
        >
          <RefreshCw size={14} className={offers.refreshing ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-4 text-xs font-bold text-white transition hover:bg-brand-dark"
        >
          <Plus size={15} />
          {t('عرض جديد', 'New Offer')}
        </button>
      </div>

      {/* Error */}
      {offers.error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-danger-tint px-4 py-3 text-xs font-semibold text-danger-ink"
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span className="flex-1">{language === 'ar' ? offers.error.message : offers.error.localizedMessage}</span>
          <button
            type="button"
            onClick={reload}
            disabled={offers.refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-surface px-2.5 py-1 font-bold text-danger transition active:scale-95 disabled:opacity-60"
          >
            <RefreshCw size={12} className={offers.refreshing ? 'animate-spin' : ''} />
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </div>
      )}

      {/* Loading skeletons */}
      {offers.loading && (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <div key={i} className="skeleton h-16 rounded-xl shadow-card" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!offers.loading && !offers.error && offerList.length === 0 && (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-surface text-brand">
            <Megaphone size={22} />
          </span>
          <h3 className="mt-3 text-sm font-extrabold">
            {t('لا توجد عروض بعد', 'No offers yet')}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            {t('أنشئ عرضاً ترويجياً ليظهر في صفحة المتجر', 'Create a promotional offer to show on your store page')}
          </p>
        </div>
      )}

      {/* Offers list */}
      {!offers.loading && offerList.length > 0 && (
        <div className="space-y-3">
          {offerList.map(o => (
            <div
              key={o.id}
              className={`flex items-center gap-4 rounded-xl border bg-surface p-4 shadow-card transition ${
                o.isActive ? 'border-line' : 'border-line opacity-60'
              }`}
            >
              {/* Banner thumbnail */}
              {o.imageUrl ? (
                <img
                  src={o.imageUrl}
                  alt={o.titleAr}
                  className="h-16 w-28 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                  <Megaphone size={20} />
                </span>
              )}

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-extrabold text-ink">{o.titleAr}</span>
                  {o.productIds.length === 0 && (
                    <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-micro font-bold text-brand-dark">
                      {t('-store-wide', '-store-wide')}
                    </span>
                  )}
                  {o.productIds.length > 0 && (
                    <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-micro font-bold text-ink-muted">
                      {t(`${o.productIds.length} منتج`, `${o.productIds.length} products`)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">{o.descriptionAr}</p>
                {o.startsAt || o.expiresAt ? (
                  <p className="mt-1 text-micro text-ink-muted" dir="ltr">
                    {o.startsAt ? o.startsAt.slice(0, 10) : '…'} → {o.expiresAt ? o.expiresAt.slice(0, 10) : '…'}
                  </p>
                ) : null}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggle(o)}
                  disabled={togglingId === o.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-micro font-bold transition ${
                    o.isActive
                      ? 'bg-brand-tint text-brand-dark hover:bg-brand-soft'
                      : 'bg-canvas text-ink-muted hover:bg-line-soft'
                  } disabled:opacity-60`}
                  aria-label={o.isActive ? 'Deactivate' : 'Activate'}
                >
                  {togglingId === o.id
                    ? <Loader2 size={10} className="animate-spin" />
                    : o.isActive
                      ? <><Check size={10} /> {t('نشط', 'Active')}</>
                      : t('معطّل', 'Off')}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(o)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition hover:border-brand hover:text-brand"
                  aria-label={`Edit ${o.titleAr}`}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(o)}
                  disabled={deletingId === o.id}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-danger-tint bg-surface text-danger transition hover:bg-danger-tint disabled:opacity-60"
                  aria-label={`Delete ${o.titleAr}`}
                >
                  {deletingId === o.id
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="offer-modal-title"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-raised max-h-[90vh] overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="offer-modal-title" className="text-base font-extrabold text-ink">
                {t(modal === 'create' ? 'إنشاء عرض جديد' : 'تعديل العرض', modal === 'create' ? 'New Offer' : 'Edit Offer')}
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
              {/* Arabic title */}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink">{t('العنوان بالعربية *', 'Arabic title *')}</span>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={form.titleAr}
                  onChange={e => setForm(f => ({ ...f, titleAr: e.target.value }))}
                  placeholder={t('مثال: عرض weekend', 'e.g. Weekend Deal')}
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>

              {/* English title */}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink">{t('العنوان بالإنجليزية *', 'English title *')}</span>
                <input
                  type="text"
                  value={form.titleEn}
                  onChange={e => setForm(f => ({ ...f, titleEn: e.target.value }))}
                  placeholder="Weekend Deal"
                  dir="ltr"
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>

              {/* Arabic description */}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink">{t('الوصف بالعربية *', 'Arabic description *')}</span>
                <textarea
                  value={form.descriptionAr}
                  onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))}
                  placeholder={t('وصف مختصر للعرض', 'Short offer description')}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>

              {/* English description */}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-ink">{t('الوصف بالإنجليزية *', 'English description *')}</span>
                <textarea
                  value={form.descriptionEn}
                  onChange={e => setForm(f => ({ ...f, descriptionEn: e.target.value }))}
                  placeholder="Short offer description"
                  rows={2}
                  dir="ltr"
                  className="w-full resize-none rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>

              {/* Window + sort order */}
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-ink">
                    {t('يبدأ', 'Starts')} <span className="font-normal text-ink-muted">({t('اختياري', 'opt')})</span>
                  </span>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))}
                    dir="ltr"
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-ink">
                    {t('ينتهي', 'Expires')} <span className="font-normal text-ink-muted">({t('اختياري', 'opt')})</span>
                  </span>
                  <input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                    dir="ltr"
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-ink">
                    {t('الترتيب', 'Order')} <span className="font-normal text-ink-muted">({t('اختياري', 'opt')})</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="999"
                    step="1"
                    value={form.sortOrder}
                    onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                    placeholder="0"
                    dir="ltr"
                    className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </label>
              </div>

              {/* Banner image */}
              {modal === 'edit' && editTarget && (
                <div className="rounded-xl border border-line bg-canvas p-3">
                  <span className="mb-2 block text-xs font-bold text-ink">
                    {t('صورة البانر (800×450)', 'Banner image (800×450)')}
                  </span>
                  <div className="flex items-center gap-3">
                    {editTarget.imageUrl ? (
                      <img
                        src={editTarget.imageUrl}
                        alt={editTarget.titleAr}
                        className="h-16 w-28 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                        <Megaphone size={20} />
                      </span>
                    )}
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        aria-label="Choose a banner image"
                        onChange={e => void handleImagePicked(e.target.files?.[0])}
                      />
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={imageBusy}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[11px] font-bold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-60"
                      >
                        {imageBusy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                        {editTarget.imageUrl ? t('تغيير', 'Change') : t('إضافة', 'Add')}
                      </button>
                      {editTarget.imageUrl && (
                        <button
                          type="button"
                          onClick={() => void handleImageRemove()}
                          disabled={imageBusy}
                          className="flex h-8 items-center gap-1 rounded-lg border border-line px-3 text-[11px] font-bold text-ink-muted transition hover:bg-danger-tint hover:text-danger-ink active:scale-95 disabled:opacity-60"
                        >
                          <X size={12} />
                          {t('إزالة', 'Remove')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Product targeting */}
              <div className="rounded-xl border border-line bg-canvas p-3">
                <span className="mb-2 block text-xs font-bold text-ink">
                  {t('المنتجات المستهدفة', 'Target products')}
                </span>
                <p className="mb-2 text-[11px] text-ink-muted">
                  {t(
                    'اترك فارغاً لعرض عام للمتجر، أو حدد منتجات معينة.',
                    'Leave empty for a store-wide offer, or pick specific products.'
                  )}
                </p>
                {allProducts.length === 0 ? (
                  <p className="text-[11px] text-ink-muted italic">
                    {t('لا توجد منتجات بعد — أضف منتجات أولاً.', 'No products yet — add products first.')}
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {allProducts.map(p => (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition ${
                          form.productIds.includes(p.id) ? 'bg-brand-tint' : 'hover:bg-surface'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={form.productIds.includes(p.id)}
                          onChange={() => toggleProduct(p.id)}
                          className="h-3.5 w-3.5 rounded border-line text-brand accent-brand"
                        />
                        <span className="text-xs font-bold text-ink">{p.nameAr}</span>
                        {p.categoryName && (
                          <span className="text-[10px] text-ink-muted">({p.categoryName})</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>

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