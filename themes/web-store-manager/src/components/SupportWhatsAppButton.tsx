/**
 * Floating WhatsApp support button — store manager app wrapper.
 * Delegates rendering to the shared `WhatsAppFAB` in `@samou-go/ui`.
 */
import { WhatsAppFAB, useLanguage } from '@samou-go/ui';
import { formatWhatsAppLink } from '@samou-go/shared-types';
import { usePlatformSettings } from '@samou-go/api-client';

const DEFAULT_SUPPORT_PHONE = '0590000000';

export function SupportWhatsAppButton() {
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';
  const platformSettings = usePlatformSettings();

  const phone = platformSettings.data?.whatsappSupportNumber || DEFAULT_SUPPORT_PHONE;
  const message = isArabic ? 'مرحبا اريد الاستفسار عن شيء ما' : 'Hello, I would like to ask about something';
  const href = formatWhatsAppLink(phone, message);

  return (
    <WhatsAppFAB
      href={href}
      label={t('الدعم الفني والشكاوى', 'Support & complaints')}
    />
  );
}
