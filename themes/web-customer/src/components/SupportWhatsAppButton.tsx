/**
 * Floating WhatsApp support button — customer app wrapper.
 * Delegates rendering to the shared `WhatsAppFAB` in `@samou-go/ui`.
 */
import { Link, useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { WhatsAppFAB } from '@samou-go/ui';
import { useLanguage } from '@samou-go/ui';
import { formatWhatsAppLink } from '@samou-go/shared-types';
import { usePlatformSettings } from '@/hooks/useApi';



export function SupportWhatsAppButton() {
  const { t, language } = useLanguage();
  const isArabic = language === 'ar';
  const platformSettings = usePlatformSettings();
  const location = useLocation();

  const phone = platformSettings.data?.whatsappSupportNumber?.trim();
  if (location.pathname === '/support') return null;
  if (!phone) return (
    <Link to="/support" aria-label={t('المساعدة والدعم', 'Help & support')}
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] end-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-card transition active:scale-95">
      <MessageCircle size={22} />
    </Link>
  );
  const message = isArabic ? 'مرحبا اريد الاستفسار عن شيء ما' : 'Hello, I would like to ask about something';
  const href = formatWhatsAppLink(phone, message);

  return (
    <WhatsAppFAB
      href={href}
      label={t('الدعم الفني والشكاوى', 'Support & complaints')}
    />
  );
}
