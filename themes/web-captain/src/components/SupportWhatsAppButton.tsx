/**
 * Floating WhatsApp support button for the standalone captain app.
 *
 * The support number is read from PlatformSettings (admin-configurable).
 */

import { MessageCircle } from 'lucide-react';
import { useLanguage } from '@samou-go/ui';
import { formatWhatsAppLink, WHATSAPP_MESSAGES } from '@samou-go/shared-types';
import { usePlatformSettings } from '@samou-go/api-client';

/** Fallback number used when PlatformSettings has not been provisioned yet. */
const DEFAULT_SUPPORT_PHONE = '0590000000';

export function SupportWhatsAppButton() {
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';
  const platformSettings = usePlatformSettings();

  const phone = platformSettings.data?.whatsappSupportNumber || DEFAULT_SUPPORT_PHONE;

  if (!phone) return null;

  const message = WHATSAPP_MESSAGES.generic(isArabic ? 'الدعم الفني' : 'Support');
  const href = formatWhatsAppLink(phone, message);

  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('الدعم الفني والشكاوى', 'Support & complaints')}
      title={t('الدعم الفني والشكاوى', 'Support & complaints')}
      className="fixed bottom-20 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition hover:bg-green-600 hover:scale-110 active:scale-95 md:bottom-6"
      style={{ insetInlineEnd: '1rem' }}
    >
      <MessageCircle size={22} />
    </a>
  );
}
