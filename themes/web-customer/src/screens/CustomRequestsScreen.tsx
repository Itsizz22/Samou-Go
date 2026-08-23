import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ImagePlus, Loader2, X } from 'lucide-react';
import {
  cancelCustomRequest,
  createCustomRequest,
  listMyCustomRequests,
  respondToCustomRequest,
  useMutation,
  useResource,
  useStores,
  useToast,
  useUploadImage,
} from '@/hooks/useApi';
import { CustomRequestStatus, type CreateCustomRequestInput } from '@samou-go/shared-types';
import { ScreenShell } from '@/components/ScreenShell';
import { useLanguage } from '@samou-go/ui';

export function CustomRequestsScreen() {
  const toast = useToast();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const stores = useStores({ pageSize: 100 });
  const requests = useResource('my-custom-requests', (signal) => listMyCustomRequests({}, signal), { pollMs: 15_000 });
  const create = useMutation<CreateCustomRequestInput, Awaited<ReturnType<typeof createCustomRequest>>>((input, signal) =>
    createCustomRequest(input, signal),
  );
  const upload = useUploadImage();

  const [storeId, setStoreId] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoPicked = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('الملف أكبر من 8MB', 'File exceeds 8MB');
      return;
    }
    setImageBusy(true);
    try {
      const result = await upload.run({ kind: 'store', purpose: 'image', file });
      if (result) {
        setImageUrl(result.url);
      } else {
        toast.error(upload.error?.message ?? 'تعذّر رفع الصورة', 'Upload failed');
      }
    } finally {
      setImageBusy(false);
    }
  };

  const removePhoto = () => {
    setImageUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!storeId || !description.trim()) return;
    const result = await create.run({
      storeId,
      description: description.trim(),
      ...(imageUrl ? { imageUrl } : {}),
    });
    if (result) {
      setDescription('');
      setImageUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      requests.reload();
      toast.success('تم إرسال الطلب', 'Request sent');
    } else {
      toast.error('تعذّر إرسال الطلب', create.error?.localizedMessage ?? 'Try again');
    }
  };

  const respond = async (id: string, action: 'ACCEPT' | 'REJECT') => {
    try {
      await respondToCustomRequest(id, { action });
      requests.reload();
      toast.success('تم تحديث الطلب', 'Request updated');
    } catch (error) {
      toast.error('تعذّر تحديث الطلب', error instanceof Error ? error.message : 'Try again');
    }
  };

  const cancel = async (id: string) => {
    try {
      await cancelCustomRequest(id);
      requests.reload();
    } catch (error) {
      toast.error('تعذّر الإلغاء', error instanceof Error ? error.message : 'Try again');
    }
  };

  return (
    <ScreenShell title="طلبات مخصصة" subtitle="Custom requests">
      <div className="space-y-4 px-4 pb-8">
        <button type="button" onClick={() => navigate(-1)} className="text-xs font-bold text-brand">
          ← رجوع
        </button>

        {/* Create form */}
        <form onSubmit={(event) => void submit(event)} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <h2 className="text-sm font-extrabold">اطلب شيئاً غير موجود في القائمة</h2>

          <select
            value={storeId}
            onChange={(event) => setStoreId(event.target.value)}
            className="input-field mt-3"
            required
          >
            <option value="">اختر المتجر</option>
            {stores.data?.items.map((store) => (
              <option key={store.id} value={store.id}>
                {store.nameAr}
              </option>
            ))}
          </select>

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="input-field mt-2 min-h-24"
            placeholder="اكتب طلبك بالتفصيل"
            required
          />

          {/* Photo attachment */}
          <div className="mt-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => void handlePhotoPicked(event.target.files?.[0])}
            />

            {imageUrl ? (
              <div className="relative mt-2 inline-block">
                <img src={imageUrl} alt="Attachment" className="h-20 w-20 rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageBusy}
                className="mt-2 flex items-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-[11px] font-bold text-ink-muted transition hover:bg-brand-surface hover:text-brand active:scale-95 disabled:opacity-60"
              >
                {imageBusy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Camera size={14} />
                )}
                {t('إرفاق صورة', 'Attach photo')}
              </button>
            )}
          </div>

          <button
            disabled={create.pending || imageBusy}
            className="mt-3 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {create.pending ? t('جارٍ الإرسال...', 'Sending...') : 'إرسال الطلب'}
          </button>
        </form>

        {/* Existing requests */}
        <section className="space-y-3">
          {requests.data?.items.map((request) => (
            <article key={request.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="flex justify-between gap-3">
                <b>{request.store.nameAr}</b>
                <span className="text-xs text-ink-muted">{request.status}</span>
              </div>
              <p className="mt-2 text-sm">{request.description}</p>

              {/* Show attached photo if present */}
              {request.imageUrl && (
                <img
                  src={request.imageUrl}
                  alt="Attached"
                  className="mt-2 h-24 w-24 rounded-xl object-cover"
                />
              )}

              {request.offeredPrice !== null && (
                <p dir="ltr" className="mt-2 font-extrabold">
                  ₪{request.offeredPrice.toFixed(2)} {request.offerNote}
                </p>
              )}
              {request.status === CustomRequestStatus.PRICE_OFFERED && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => void respond(request.id, 'ACCEPT')}
                    className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white"
                  >
                    قبول
                  </button>
                  <button
                    onClick={() => void respond(request.id, 'REJECT')}
                    className="rounded-lg border border-line px-3 py-2 text-xs font-bold"
                  >
                    رفض
                  </button>
                </div>
              )}
              {request.status === CustomRequestStatus.PENDING && (
                <button
                  onClick={() => void cancel(request.id)}
                  className="mt-3 text-xs font-bold text-danger"
                >
                  إلغاء الطلب
                </button>
              )}
            </article>
          ))}
          {!requests.loading && !requests.data?.items.length && (
            <p className="py-8 text-center text-sm text-ink-muted">لا توجد طلبات مخصصة بعد</p>
          )}
        </section>
      </div>
    </ScreenShell>
  );
}
