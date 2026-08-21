/**
 * SMS gateway abstraction — swap providers via configuration, never via code.
 *
 * The API never imports a provider SDK directly. It talks to the single
 * `getSmsGateway()` factory, which returns an adapter selected by the
 * `SMS_PROVIDER` env var. Adding a carrier tomorrow is a new adapter file,
 * not a change to the OTP service.
 *
 * The contract is deliberately tiny: send a bilingual message body to one
 * phone. OTP composition stays in the auth module.
 */

/** A plain mobile number, canonical `05XXXXXXXX`, ready for the provider. */
export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsSendResult {
  /** `true` when the carrier accepted the message for delivery. */
  accepted: boolean;
  /** Provider reference, for logs / dedupe. Optional. */
  providerMessageId?: string;
}

/** One adapter per provider. Implementers must swallow nothing — a failed
 *  dispatch must reject so the request fails loudly rather than "succeeding"
 *  without an SMS reaching the customer.
 *
 *  Providers that support server-managed verification (e.g. Twilio Verify)
 *  may expose optional `verify()` and `check()` methods. The OTP service
 *  checks for these at runtime; when absent, it falls back to local
 *  bcrypt-based code comparison. */
export interface SmsGateway {
  readonly provider: string;
  send(message: SmsMessage): Promise<SmsSendResult>;
}
