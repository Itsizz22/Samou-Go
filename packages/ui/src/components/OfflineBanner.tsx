/**
 * OfflineBanner — sticky top banner shown when the device loses connectivity.
 *
 * Displays a clear, non-intrusive amber notice. Automatically hides when
 * the connection is restored.
 */
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const { isOffline } = useNetworkStatus();

  if (!isOffline) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9998] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      role="alert"
    >
      <WifiOff size={14} />
      <span>تعذر الاتصال بالإنترنت — جاري إعادة المحاولة تلقائياً…</span>
    </div>
  );
}
