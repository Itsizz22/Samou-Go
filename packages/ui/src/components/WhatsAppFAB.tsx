/**
 * WhatsAppFAB — floating action button that opens a WhatsApp chat.
 *
 * Pure presentational component: the caller provides the `href` (built from
 * `formatWhatsAppLink` + the support number). This keeps `packages/ui`
 * dependency-free from `api-client` — each SPA wires its own
 * `usePlatformSettings` to build the link.
 */
import { MessageCircle } from 'lucide-react';

export interface WhatsAppFABProps {
  /** Pre-built WhatsApp click-to-chat URL. Pass `null`/`undefined` to hide. */
  href: string | null | undefined;
  /** Accessible label (bilingual). */
  label: string;
}

export function WhatsAppFAB({ href, label }: WhatsAppFABProps) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="fixed bottom-20 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition hover:bg-green-600 hover:scale-110 active:scale-95 md:bottom-6"
      style={{ insetInlineEnd: '1rem' }}
    >
      <MessageCircle size={22} />
    </a>
  );
}
