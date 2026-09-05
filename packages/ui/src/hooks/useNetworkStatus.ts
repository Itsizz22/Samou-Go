/**
 * useNetworkStatus — lightweight hook to monitor browser online/offline status.
 *
 * Uses `navigator.onLine` and listens to `online`/`offline` window events.
 * Returns `{ isOnline, isOffline }` with reactive state updates.
 */
import { useEffect, useState } from 'react';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Also poll every 10s as a safety net — some WebView environments
    // don't fire the events reliably.
    const poll = setInterval(() => {
      setIsOnline(navigator.onLine);
    }, 10_000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(poll);
    };
  }, []);

  return { isOnline, isOffline: !isOnline };
}
