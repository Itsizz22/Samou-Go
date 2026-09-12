/**
 * Phone normalisation — mirrors the API's Zod `phoneSchema` exactly so the
 * client shows the same canonical `05XXXXXXXX` shape the server stores.
 * Supports local 056/059 and 050–055, 057, 058 (+972).
 */
export function normalizePhone(input: string): string {
  const international = input.trim().replace(/[\s-()]/g, "").replace(/^00/, "+");
  if (/^05[0-578]\d{7}$/.test(international)) return `+972${international.slice(1)}`;
  if (/^\+?9725[0-578]\d{7}$/.test(international)) return `+${international.replace(/^\+/, "")}`;
  const digits = input
    .trim()
    .replace(/[\s-()]/g, '')
    .replace(/^\+/, '');
  if (digits.startsWith('00970')) return `0${digits.slice(5)}`;
  if (digits.startsWith('00972')) return `0${digits.slice(5)}`;
  if (digits.startsWith('970')) return `0${digits.slice(3)}`;
  if (digits.startsWith('972')) return `0${digits.slice(3)}`;
  return digits;
}

export function isValidPalestinianMobile(input: string): boolean {
  return /^(?:05[69]\d{7}|\+9725[0-578]\d{7})$/.test(normalizePhone(input));
}

/**
 * `05XXXXXXXX` → `+9705XXXXXXXX` — the E.164 shape carriers require.
 * The API's SMS dispatch uses the same conversion server-side.
 */
export function toE164(input: string, _countryCode = '+970'): string {
  const normalized = normalizePhone(input);
  return normalized.startsWith('05') ? `+970${normalized.slice(1)}` : normalized.startsWith("+") ? normalized : `+${normalized}`;
}
