/**
 * Generic HTTPS adapter — a configurable webhook for self-hosted SMS gateways
 * (e.g. a local SMPP/Melipayamak-style aggregator). Also provides the two
 * non-network fallbacks used in development and tests.
 */

import { env } from '../../config/env';
import type { SmsGateway, SmsMessage, SmsSendResult } from './types';

/** POSTs to `SMS_GENERIC_ENDPOINT` with an API-key header. */
export function createGenericGateway(): SmsGateway {
  const { endpoint, apiKey, sender } = env.sms.generic;

  if (!endpoint) {
    throw new Error('SMS_PROVIDER=generic requires SMS_GENERIC_ENDPOINT');
  }

  return {
    provider: 'generic',
    async send(message: SmsMessage): Promise<SmsSendResult> {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          to: message.to,
          body: message.body,
          ...(sender ? { from: sender } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`SMS gateway rejected the message (${response.status})`);
      }

      return { accepted: true };
    },
  };
}

/**
 * Dev-only: prints the code to stdout so a developer can sign in without a
 * carrier. The message body is what the customer would receive; it is the OTP
 * service's responsibility to generate it without ever logging it elsewhere.
 */
export function createConsoleGateway(): SmsGateway {
  return {
    provider: 'console',
    async send(message: SmsMessage): Promise<SmsSendResult> {
      // Deliberate: this is the developer's stand-in for their own phone.
      // Production is configured with a real carrier and never reaches here.
      console.log(
        `[SMS:console] to=${message.to}\n${message.body}`
      );
      return { accepted: true };
    },
  };
}

/** Test-only: accepts silently. */
export function createNoopGateway(): SmsGateway {
  return {
    provider: 'none',
    async send(): Promise<SmsSendResult> {
      return { accepted: true };
    },
  };
}
