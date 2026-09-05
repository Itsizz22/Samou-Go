/**
 * Floating WhatsApp support button — captain app wrapper.
 * Delegates rendering to the shared `WhatsAppFAB` in `@samou-go/ui`.
 */
import { WhatsAppFAB, useLanguage } from '@samou-go/ui';
import { formatWhatsAppLink, WHATSAPP_MESSAGES } from '@samou-go/shared-types';
import { usePlatformSettings } from '@samou-go/api-client';

const DEFAULT_SUPPORT_PHONE = '0590000000';

export function SupportWhatsAppButton() {
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';
  const platformSettings = usePlatformSettings();

  const phone = platformSettings.data?.whatsappSupportNumber || DEFAULT_SUPPORT_PHONE;
  const message = WHATSAPP_MESSAGES.generic(isArabic ? 'الدعم الفني' : 'Support');
  const href = formatWhatsAppLink(phone, message);

  return (
    <WhatsAppFAB
      href={href}
      label={t('الدعم الفني والشكاوى', 'Support & complaints')}
    />
  );
}
