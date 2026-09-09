import { Image } from 'lucide-react';
export function ProductPhotoFallback() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-canvas p-3 text-ink-muted">
      <Image size={28} aria-hidden="true" />
      <span className="text-xs">صورة المنتج ستتوفر قريباً</span>
    </div>
  );
}
