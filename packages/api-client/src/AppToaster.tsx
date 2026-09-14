import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { Toaster } from 'sonner';
import { useAppLanguage } from './language';

/** One shared presentation for in-app feedback across all roles. */
export function AppToaster() {
  const arabic = useAppLanguage() === 'ar';
  return <Toaster
    className="sq-toaster"
    position="top-center"
    dir={arabic ? 'rtl' : 'ltr'}
    visibleToasts={1}
    closeButton
    offset="max(16px, env(safe-area-inset-top))"
    mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 16, right: 16 }}
    icons={{ success: <Check size={20} />, error: <TriangleAlert size={20} />, warning: <TriangleAlert size={20} />, info: <Info size={20} />, close: <X size={16} /> }}
    toastOptions={{ className: 'sq-toast', closeButtonAriaLabel: arabic ? 'إغلاق التنبيه' : 'Dismiss notification' }}
  />;
}
