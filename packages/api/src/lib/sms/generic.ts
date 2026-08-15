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
        const detail = await response.text().catch(() => '');
        throw new Error(
          `SMS gateway rejected the message (${response.status}): ${detail.slice(0, 200) || 'no detail'}`,
        );
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

/**
 * Test-only fallback for when NO live carrier is configured yet (e.g. a
 * staging deployment before Twilio onboarding finishes). Logs the code to
 * stdout exactly like `console`, but advertises `provider: 'mock'` so the OTP
 * service reports `dispatched: false` — clients can then surface a "test mode"
 * hint instead of pretending a real SMS was sent.
 *
 * In production this is gated behind `SMS_ALLOW_INSECURE_TEST_PROVIDERS=true`
 * (see `config/env.ts`) so it can never be switched on by accident.
 */
export function createMockGateway(): SmsGateway {
  return {
    provider: 'mock',
    async send(message: SmsMessage): Promise<SmsSendResult> {
      console.log(
        `[SMS:mock] to=${message.to}\n${message.body}\n---\nTest mode: no real SMS was sent.`
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
