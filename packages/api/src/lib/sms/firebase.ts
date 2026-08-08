/**
 * Firebase adapter — delegates SMS dispatch to a Firebase Cloud Function.
 *
 * Firebase Auth's server-side API does not expose a generic "send SMS to this
 * phone" endpoint; the honest integration for a Firebase stack is a small HTTP
 * cloud function owned by the same project. This adapter posts the canonical
 * message to that function and requires it to return `{ success: true }`.
 *
 * Expected cloud-function contract:
 *   POST {FIREBASE_SMS_FUNCTION_URL}
 *   Headers: { "x-api-key": {FIREBASE_SMS_API_KEY} }
 *   Body:    { "to": "05XXXXXXXX", "body": "…" }
 *   200 → { "success": true }
 */

import { env } from '../../config/env';
import type { SmsGateway, SmsMessage, SmsSendResult } from './types';

export function createFirebaseGateway(): SmsGateway {
  const { functionUrl, apiKey } = env.sms.firebase;

  if (!functionUrl) {
    throw new Error('SMS_PROVIDER=firebase requires FIREBASE_SMS_FUNCTION_URL');
  }

  return {
    provider: 'firebase',
    async send(message: SmsMessage): Promise<SmsSendResult> {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify({ to: message.to, body: message.body }),
      });

      const payload = (await response.json().catch(() => ({}))) as { success?: boolean };

      if (!response.ok || payload.success !== true) {
        throw new Error(`Firebase function rejected the message (${response.status})`);
      }

      return { accepted: true };
    },
  };
}
