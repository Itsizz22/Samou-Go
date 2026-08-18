/**
 * Samou' Go — unified toast hook.
 *
 * Wraps `sonner` (react-hot-toast-compatible) so every screen can fire a toast
 * without knowing which library is underneath. Messages are passed as the
 * canonical bilingual pair `(ar, en)`; only the active language's side is
 * rendered, and the toast direction follows the active locale.
 */

import { toast } from 'sonner';
import { useAppLanguage } from './language';

export interface ToastOptions {
  /** Show for this many ms. Defaults to 3000. */
  duration?: number;
  /** Override the Arabic side of the message. */
  ar?: string;
  /** Override the English side of the message. */
  en?: string;
}

const DEFAULT_DURATION = 3_000;

export function useToast() {
  const language = useAppLanguage();
  const isArabic = language === 'ar';

  const pick = (ar: string, en: string, options?: ToastOptions): string =>
    isArabic ? (options?.ar ?? ar) : (options?.en ?? en);

  const style = isArabic
    ? { direction: 'rtl' as const, textAlign: 'right' as const }
    : { direction: 'ltr' as const, textAlign: 'left' as const };

  const success = (ar: string, en: string, options?: ToastOptions) => {
    toast.success(pick(ar, en, options), {
      duration: options?.duration ?? DEFAULT_DURATION,
      position: 'top-center',
      style,
    });
  };

  const error = (ar: string, en: string, options?: ToastOptions) => {
    toast.error(pick(ar, en, options), {
      duration: options?.duration ?? DEFAULT_DURATION,
      position: 'top-center',
      style,
    });
  };

  const info = (ar: string, en: string, options?: ToastOptions) => {
    toast(pick(ar, en, options), {
      duration: options?.duration ?? DEFAULT_DURATION,
      position: 'top-center',
      style,
    });
  };

  return { success, error, info } as const;
}
