/**
 * Twilio adapter — uses the official twilio Node SDK.
 *
 * Two dispatch paths:
 *   1. **Twilio Verify** (default when `TWILIO_VERIFY_SERVICE_SID` is set):
 *      delegates code generation and verification to Twilio's managed Verify
 *      service. The adapter exposes `verify()` and `check()` so the OTP service
 *      can offload code lifecycle to Twilio.
 *   2. **Twilio Messages** (fallback when `TWILIO_VERIFY_SERVICE_SID` is absent):
 *      sends raw SMS via the Messages API — the server generates and stores
 *      the OTP code itself (same flow as other SMS providers).
 */

import Twilio from 'twilio';
import { env } from '../../config/env';
import type { SmsGateway, SmsMessage, SmsSendResult } from './types';

export interface TwilioVerifyResult {
  sid: string;
  status: string;
}

export interface TwilioCheckResult {
  sid: string;
  status: string;
  valid: boolean;
}

export function createTwilioGateway(): SmsGateway & {
  verify?(to: string, customMessage?: string): Promise<TwilioVerifyResult>;
  check?(to: string, code: string): Promise<TwilioCheckResult>;
} {
  const { accountSid, authToken, from } = env.sms.twilio;
  const verifyServiceSid = env.sms.twilio.verifyServiceSid;

  if (!accountSid || !authToken) {
    throw new Error(
      'SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN',
    );
  }

  const client = Twilio(accountSid, authToken);

  // ── Verify path ──────────────────────────────────────────────────────────
  if (verifyServiceSid) {
    return {
      provider: 'twilio',
      async send(message: SmsMessage): Promise<SmsSendResult> {
        const verification = await client.verify.v2
          .services(verifyServiceSid)
          .verifications.create({
            to: message.to,
            channel: 'sms',
          });

        return {
          accepted: verification.status === 'pending',
          providerMessageId: verification.sid,
        };
      },

      async verify(to: string, customMessage?: string): Promise<TwilioVerifyResult> {
        // When a custom bilingual body is required (e.g. Arabic+English
        // server-generated message), bypass Verify and send via Messages API.
        if (customMessage && from) {
          await client.messages.create({
            to,
            from,
            body: customMessage,
          });
          // Return a synthetic pending result — the OTP service stores the
          // code hash in the DB and verifies it server-side, same as the
          // Messages-only path.
          return { sid: 'raw-sms', status: 'pending' };
        }

        const verification = await client.verify.v2
          .services(verifyServiceSid)
          .verifications.create({ to, channel: 'sms' });

        return { sid: verification.sid, status: verification.status };
      },

      async check(to: string, code: string): Promise<TwilioCheckResult> {
        const check = await client.verify.v2
          .services(verifyServiceSid)
          .verificationChecks.create({ to, code });

        return {
          sid: check.sid,
          status: check.status,
          valid: check.valid,
        };
      },
    };
  }

  // ── Messages-only path (no Verify service configured) ────────────────────
  if (!from) {
    throw new Error(
      'SMS_PROVIDER=twilio requires TWILIO_FROM_NUMBER',
    );
  }

  return {
    provider: 'twilio',
    async send(message: SmsMessage): Promise<SmsSendResult> {
      const msg = await client.messages.create({
        to: message.to,
        from,
        body: message.body,
      });

      return {
        accepted: msg.status === 'queued' || msg.status === 'sent',
        providerMessageId: msg.sid,
      };
    },
  };
}
