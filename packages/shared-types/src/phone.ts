/**
 * Samou' Go — phone number utilities.
 *
 * Normalises local Palestinian mobile numbers to international format
 * and builds click-to-chat WhatsApp links.
 *
 * Palestinian numbers: 059XXXXXXX, 056XXXXXXX → +97059XXXXXXX, +97056XXXXXXX
 */

const PALESTINE_PREFIXES = ['059', '056'];

/**
 * Normalises a local phone number to international E.164 format.
 *
 * Supported input formats:
 * - `059XXXXXXX` → `+97059XXXXXXX` (Palestine)
 * - `056XXXXXXX` → `+97056XXXXXXX` (Palestine/Jawwal)
 * - Already international: `+97059XXXXXXX` or `97059XXXXXXX` → `+97059XXXXXXX`
 * - Already international: `+97259XXXXXXX` or `97259XXXXXXX` → `+97259XXXXXXX`
 *
 * @param phone - Phone number in local or international format
 * @returns Normalised international format (e.g., `+97059XXXXXXX`) or empty string if invalid
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';

  const cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // Already in international format with +
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // International format without + (e.g., 97059XXXXXXX)
  if (cleaned.startsWith('970') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith('972') && cleaned.length === 12) {
    return `+${cleaned}`;
  }

  // Palestinian local format: 059XXXXXXX or 056XXXXXXX (10 digits)
  if (PALESTINE_PREFIXES.some((p) => cleaned.startsWith(p)) && cleaned.length === 10) {
    return `+970${cleaned.slice(1)}`;
  }

  // If it looks like a valid international number already, prefix with +
  if (/^\d{11,15}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Return original cleaned if we can't determine the format
  return cleaned;
}

/**
 * Builds a WhatsApp click-to-chat URL.
 *
 * @param phone - Phone number in any supported format
 * @param message - Optional pre-filled message (will be URL-encoded)
 * @returns WhatsApp Web/App URL or empty string if phone is invalid
 */
export function formatWhatsAppLink(phone: string, message?: string): string {
  const normalized = normalizePhoneNumber(phone);

  // Basic validation: must start with + and have 10-15 digits after
  if (!normalized.startsWith('+') || normalized.length < 11 || normalized.length > 16) {
    return '';
  }

  // Remove + for wa.me format
  const waNumber = normalized.slice(1);

  const baseUrl = `https://wa.me/${waNumber}`;
  if (!message) return baseUrl;

  const encodedMessage = encodeURIComponent(message);
  return `${baseUrl}?text=${encodedMessage}`;
}

/**
 * Pre-filled WhatsApp message templates for different roles.
 */
export const WHATSAPP_MESSAGES = {
  /** Captain/driver contacting customer about an order */
  captain: (orderNumber: string, customerName?: string) => {
    const namePart = customerName ? ` ${customerName}` : '';
    return `مرحباً${namePart}، معك كابتن التوصيل من تطبيق سموع قو بخصوص طلبك رقم #${orderNumber}.`;
  },

  /** Store manager contacting customer about an order */
  storeManager: (orderNumber: string, customerName?: string, storeName?: string) => {
    const namePart = customerName ? ` ${customerName}` : '';
    const storePart = storeName ? ` من ${storeName}` : '';
    return `مرحباً${namePart}، مع حضرتك إدارة المتجر${storePart} من تطبيق سموع قو بخصوص طلبك رقم #${orderNumber}.`;
  },

  /** Generic contact message */
  generic: (context: string) => {
    return `مرحباً، معك ${context} من تطبيق سموع قو.`;
  },
} as const;