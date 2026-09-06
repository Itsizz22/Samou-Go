/**
 * Human-friendly reference identifiers for Samou Quick.
 *
 * Order numbers:  SQ-YYMMDD-XXXX  (unambiguous alphanumeric, 32-char alphabet)
 * Customer codes: CUST-XXXXX      (5-char unambiguous alphanumeric)
 * Captain codes: CAPT-XXXXX      (5-char unambiguous alphanumeric)
 *
 * These are shared across the API and all frontends so display formatting
 * is consistent everywhere.
 */

/** 32-char unambiguous alphabet — no 0/1/I/L/O to avoid visual confusion. */
const UNAMBIGUOUS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Encode a number into a fixed-length unambiguous alphanumeric string. */
function encodeBase32(value: number, length: number): string {
  let v = value;
  let result = '';
  for (let i = 0; i < length; i++) {
    result = UNAMBIGUOUS[v % 32] + result;
    v = Math.floor(v / 32);
  }
  return result;
}

/**
 * Generate a human-facing order number: `SQ-YYMMDD-XXXX`.
 *
 * The caller is responsible for providing a unique sequence number per day
 * (via `DailyOrderSequence` in the API). This pure function is idempotent —
 * same inputs always produce the same output.
 */
export function generateOrderNumber(date: Date, sequence: number): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `SQ-${yy}${mm}${dd}-${encodeBase32(sequence, 4)}`;
}

/**
 * Generate a customer-facing user code: `CUST-XXXXX`.
 * `seed` should be a unique value (e.g. a counter or hash of the user ID).
 */
export function generateCustomerCode(seed: number): string {
  return `CUST-${encodeBase32(seed, 5)}`;
}

/**
 * Generate a captain-facing user code: `CAPT-XXXXX`.
 * `seed` should be a unique value (e.g. a counter or hash of the user ID).
 */
export function generateCaptainCode(seed: number): string {
  return `CAPT-${encodeBase32(seed, 5)}`;
}

/**
 * Generate a URL-safe store slug from a name.
 * Transliterates common Arabic chars to Latin, lowercases, and replaces
 * spaces/special chars with hyphens.
 */
export function generateStoreSlug(name: string): string {
  // Simple transliteration map for common Arabic chars used in store names
  const translit: Record<string, string> = {
    'ا': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h',
    'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's',
    'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
    'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm',
    'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a',
    'ء': 'a', 'أ': 'a', 'إ': 'i', 'ؤ': 'u', 'ئ': 'i',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  };

  const slug = name
    .split('')
    .map(ch => translit[ch] ?? ch)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // strip anything not Latin/digit/hyphen
    .replace(/[\s_]+/g, '-')       // spaces/underscores → hyphens
    .replace(/-+/g, '-')          // collapse multiple hyphens
    .replace(/^-|-$/g, '');       // trim leading/trailing hyphens

  return slug || 'store';
}
