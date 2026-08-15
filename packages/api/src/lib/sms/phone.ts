/**
 * E.164 formatting for SMS dispatch.
 *
 * The API stores and validates phones in canonical local form (`05XXXXXXXX`),
 * but every real carrier API (Twilio, Firebase function, aggregator webhooks)
 * wants an international number. This module is the single place that converts
 * the two. The country code is configurable (`SMS_COUNTRY_CODE`, default +970)
 * because both +970 and +972 route to Palestinian mobiles.
 */

/** `05XXXXXXXX` → `+9705XXXXXXXX` (drop the leading zero, prefix the code). */
export function toE164(phone: string, countryCode = '+970'): string {
  const digits = phone.replace(/[\s-()]/g, '').replace(/^\+/, '');
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('05')) return `${countryCode}${digits.slice(1)}`;
  // Already international (e.g. `9705…` / `9725…` after the leading 00/+) —
  // normalise to `+<code><national>` rather than double-prefixing.
  return `+${digits}`;
}

/**
 * `+9705XXXXXXXX` → `05XXXXXXXX` — the inverse of {@link toE164}.
 *
 * Firebase ID tokens carry the phone as E.164 (`phone_number` claim); the DB
 * stores the canonical local form, so verification must fold the code back in.
 */
export function fromE164(phone: string, countryCode = '+970'): string {
  const digits = phone.replace(/[\s-()]/g, '').replace(/^\+/, '');
  const code = countryCode.replace(/^\+/, '');
  if (digits.startsWith(code) && digits.length > code.length) {
    return `0${digits.slice(code.length)}`;
  }
  if (digits.startsWith('972') && digits.length > 3) return `0${digits.slice(3)}`;
  if (digits.startsWith('970') && digits.length > 3) return `0${digits.slice(3)}`;
  return digits;
}