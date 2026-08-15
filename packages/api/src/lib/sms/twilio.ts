/**
 * Twilio adapter — REST API over fetch, no SDK dependency.
 *
 * Sends via the Messages resource:
 *   POST /2010-04-01/Accounts/{sid}/Messages.json
 * with HTTP Basic auth (sid:authToken) and form-encoded payload.
 */

import { env } from '../../config/env';
import type { SmsGateway, SmsMessage, SmsSendResult } from './types';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

export function createTwilioGateway(): SmsGateway {
  const { accountSid, authToken, from } = env.sms.twilio;

  if (!accountSid || !authToken || !from) {
    throw new Error(
      'SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER'
    );
  }

  return {
    provider: 'twilio',
    async send(message: SmsMessage): Promise<SmsSendResult> {
      const body = new URLSearchParams({
        To: message.to,
        From: from,
        Body: message.body,
      });

      const response = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        status?: string;
        sid?: string;
        code?: number;
        message?: string;
      };

      if (!response.ok) {
        // The provider's own reason (e.g. "The 'To' number is not a valid phone
        // number") is exactly what Render logs need — surface it verbatim.
        throw new Error(
          `Twilio rejected the message (${response.status}): ${payload.message ?? payload.code ?? 'no detail'}`,
        );
      }

      return {
        accepted: true,
        providerMessageId: payload.sid,
      };
    },
  };
}
