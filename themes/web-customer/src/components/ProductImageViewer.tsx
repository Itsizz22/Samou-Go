import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
import { useAndroidOverlayBack } from '@/lib/androidBack';

/** Native modal traps focus; Android back dismisses the preview before routing. */
export function ProductImageViewer({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { t } = useLanguage();
  useAndroidOverlayBack(true, onClose);
  useEffect(() => {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => { document.body.style.overflow = overflow; focused?.focus(); };
  }, []);
  return createPortal(
    <dialog ref={dialog} aria-label={name} onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-lg overflow-hidden rounded-3xl border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-black/70">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <h2 className="text-sm font-bold">{name}</h2>
        <button autoFocus type="button" onClick={onClose} aria-label={t('إغلاق الصورة', 'Close image')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-canvas focus-visible:ring-2 focus-visible:ring-brand"><X size={20} /></button>
      </div>
      <ImageWithFallback src={src} alt={name} className="max-h-[70dvh] w-full object-contain" />
    </dialog>, document.body);
}
