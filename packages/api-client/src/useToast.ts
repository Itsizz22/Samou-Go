/**
 * Samou' Go — unified toast hook.
 *
 * Wraps `sonner` (react-hot-toast-compatible) so every screen can fire a toast
 * without knowing which library is underneath, and the RTL-safe defaults are
 * applied once.
 */

import { toast } from 'sonner';

export interface ToastOptions {
  /** Show for this many ms. Defaults to 3000. */
  duration?: number;
  /** Override the default bilingual pattern when only one language is needed. */
  ar?: string;
  en?: string;
}

const DEFAULT_DURATION = 3_000;

/** Bilingual message: Arabic first, then English in `dir="ltr"`. */
function bilingual(ar: string, en: string): string {
  return `${ar}\n${en}`;
}

export function useToast() {
  const success = (ar: string, en: string, options?: ToastOptions) => {
    toast.success(bilingual(options?.ar ?? ar, options?.en ?? en), {
      duration: options?.duration ?? DEFAULT_DURATION,
      position: 'top-center',
      style: { direction: 'rtl', textAlign: 'right' },
    });
  };

  const error = (ar: string, en: string, options?: ToastOptions) => {
    toast.error(bilingual(options?.ar ?? ar, options?.en ?? en), {
      duration: options?.duration ?? DEFAULT_DURATION,
      position: 'top-center',
      style: { direction: 'rtl', textAlign: 'right' },
    });
  };

  const info = (ar: string, en: string, options?: ToastOptions) => {
    toast(bilingual(options?.ar ?? ar, options?.en ?? en), {
      duration: options?.duration ?? DEFAULT_DURATION,
      position: 'top-center',
      style: { direction: 'rtl', textAlign: 'right' },
    });
  };

  return { success, error, info } as const;
}
