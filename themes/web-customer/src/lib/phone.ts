/**
 * Phone normalisation — mirrors the API's Zod `phoneSchema` exactly so the
 * client shows the same canonical `05XXXXXXXX` shape the server stores.
 */
export function normalizePhone(input: string): string {
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
  return /^05\d{8}$/.test(normalizePhone(input));
}
