/**
 * Infobip SMS adapter — supports both raw SMS and 2FA OTP Verify.
 *
 * Two dispatch paths:
 *   1. **2FA OTP Verify** (default when `SMS_INFOBIP_2FA_APP_ID` is set):
 *      Uses Infobip's managed 2FA API — the server sends a PIN via Infobip's
 *      endpoint and verifies it against Infobip's API. The code lifecycle is
 *      managed by Infobip (same model as Twilio Verify).
 *   2. **Raw SMS** (fallback when `SMS_INFOBIP_2FA_APP_ID` is absent):
 *      Sends a message body via Infobip's SMS API — the server generates and
 *      stores the OTP code itself (same flow as the Twilio Messages path).
 *
 * Infobip API docs: https://www.infobip.com/docs/api
 *
 * Environment variables:
 *   SMS_INFOBIP_BASE_URL     — Your Infobip base URL (e.g. "https://xxx.api.infobip.com")
 *   SMS_INFOBIP_API_KEY      — Your Infobip API key
 *   SMS_INFOBIP_SENDER       — Sender name/number (e.g. "SamouGo")
 *   SMS_INFOBIP_2FA_APP_ID   — (Optional) 2FA application ID for OTP Verify mode
 */

import { env } from '../../config/env';
import type { SmsGateway, SmsMessage, SmsSendResult } from './types';

export interface InfobipVerifyResult {
  pinId: string;
  msisdn: string;
  numberRetries: number;
}

export interface InfobipCheckResult {
  pinId: string;
  msisdn: string;
  verified: boolean;
  autoVerified: boolean;
  /** Infobip's attempt number for this PIN. */
  numberRetries: number;
}

/**
 * Build the Infobip base URL and auth headers.
 * The base URL is per-account (e.g. `https://abc123.api.infobip.com`).
 */
function getConfig() {
  const baseUrl = env.sms.infobip?.baseUrl;
  const apiKey = env.sms.infobip?.apiKey;
  const sender = env.sms.infobip?.sender;
  const appId = env.sms.infobip?.appId;

  if (!baseUrl) throw new Error('SMS_PROVIDER=infobip requires SMS_INFOBIP_BASE_URL');
  if (!apiKey) throw new Error('SMS_PROVIDER=infobip requires SMS_INFOBIP_API_KEY');

  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, sender, appId };
}

function headers(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `App ${apiKey}`,
    Accept: 'application/json',
  };
}

export function createInfobipGateway(): SmsGateway & {
  verify?(to: string): Promise<InfobipVerifyResult>;
  check?(to: string, code: string): Promise<InfobipCheckResult>;
} {
  const config = getConfig();

  // ── 2FA OTP Verify path ────────────────────────────────────────────────
  if (config.appId) {
    return {
      provider: 'infobip',

      async send(message: SmsMessage): Promise<SmsSendResult> {
        // In 2FA mode, `send()` is called by the OTP service's local code path
        // (fallback when verify fails). Send via the basic SMS API.
        const response = await fetch(`${config.baseUrl}/sms/2/text/advanced`, {
          method: 'POST',
          headers: headers(config.apiKey),
          body: JSON.stringify({
            messages: [
              {
                from: config.sender,
                destinations: [{ to: message.to }],
                text: message.body,
              },
            ],
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`Infobip SMS failed (${response.status}): ${detail.slice(0, 300)}`);
        }

        const data = await response.json() as { messages?: Array<{ status?: { groupId: number } }> };
        const msg = data.messages?.[0];
        return {
          accepted: msg?.status?.groupId === 1, // 1 = ACCEPTED
          providerMessageId: msg?.status?.groupId?.toString(),
        };
      },

      /**
       * Send a PIN via Infobip's 2FA API.
       * Infobip generates the code, sends it, and stores it for verification.
       */
      async verify(to: string): Promise<InfobipVerifyResult> {
        const response = await fetch(`${config.baseUrl}/2fa/advanced/otp/send`, {
          method: 'POST',
          headers: headers(config.apiKey),
          body: JSON.stringify({
            phoneNumber: to,
            applicationId: config.appId,
            messageId: 'samougo-otp',
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`Infobip OTP send failed (${response.status}): ${detail.slice(0, 300)}`);
        }

        const data = await response.json() as InfobipVerifyResult;
        return data;
      },

      /**
       * Verify a PIN against Infobip's 2FA API.
       */
      async check(to: string, code: string): Promise<InfobipCheckResult> {
        const response = await fetch(`${config.baseUrl}/2fa/advanced/otp/verify`, {
          method: 'POST',
          headers: headers(config.apiKey),
          body: JSON.stringify({
            phoneNumber: to,
            code,
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(`Infobip OTP verify failed (${response.status}): ${detail.slice(0, 300)}`);
        }

        const data = await response.json() as InfobipCheckResult;
        return data;
      },
    };
  }

  // ── Raw SMS path (no 2FA configured) ──────────────────────────────────
  if (!config.sender) {
    throw new Error('SMS_PROVIDER=infobip requires SMS_INFOBIP_SENDER');
  }

  return {
    provider: 'infobip',

    async send(message: SmsMessage): Promise<SmsSendResult> {
      const response = await fetch(`${config.baseUrl}/sms/2/text/advanced`, {
        method: 'POST',
        headers: headers(config.apiKey),
        body: JSON.stringify({
          messages: [
            {
              from: config.sender,
              destinations: [{ to: message.to }],
              text: message.body,
            },
          ],
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Infobip SMS failed (${response.status}): ${detail.slice(0, 300)}`);
      }

      const data = await response.json() as { messages?: Array<{ status?: { groupId: number }; messageId?: string }> };
      const msg = data.messages?.[0];
      return {
        accepted: msg?.status?.groupId === 1,
        providerMessageId: msg?.messageId,
      };
    },
  };
}
