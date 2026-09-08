import { useEffect, useRef } from 'react';

const dismissers: Array<() => void> = [];

export function dismissAndroidOverlay(): boolean {
  const dismiss = dismissers.at(-1);
  if (!dismiss) return false;
  dismiss();
  return true;
}

export function useAndroidOverlayBack(open: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const dismiss = () => close.current();
    dismissers.push(dismiss);
    return () => {
      const index = dismissers.indexOf(dismiss);
      if (index >= 0) dismissers.splice(index, 1);
    };
  }, [open]);
}
