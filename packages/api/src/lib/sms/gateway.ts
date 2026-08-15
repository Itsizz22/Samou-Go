/**
 * Selects the SMS adapter from configuration. Imported once by the auth module;
 * every dispatch goes through `getSmsGateway()` so the provider can be swapped
 * by editing `.env` alone.
 */

import { env } from '../../config/env';
import { createFirebaseGateway } from './firebase';
import { createConsoleGateway, createGenericGateway, createMockGateway, createNoopGateway } from './generic';
import { createTwilioGateway } from './twilio';
import type { SmsGateway } from './types';

let cached: SmsGateway | null = null;

export function getSmsGateway(): SmsGateway {
  if (cached) return cached;

  switch (env.sms.provider) {
    case 'twilio':
      cached = createTwilioGateway();
      break;
    case 'firebase':
      cached = createFirebaseGateway();
      break;
    case 'generic':
      cached = createGenericGateway();
      break;
    case 'console':
      cached = createConsoleGateway();
      break;
    case 'mock':
      cached = createMockGateway();
      break;
    case 'none':
    default:
      cached = createNoopGateway();
      break;
  }

  return cached;
}
