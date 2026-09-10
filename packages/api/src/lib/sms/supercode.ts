import { env } from '../../config/env';
import { toE164 } from './phone';
import type { SmsGateway } from './types';

/** Supercode JSON contract: URI-encoded text and international digits without +. */
export function createSupercodeGateway(): SmsGateway {
  const { apiId, sender } = env.sms.supercode;
  if (!apiId || !sender) throw new Error('Supercode requires API ID and approved sender');
  return {
    provider: 'supercode',
    async send(message) {
      const to = toE164(message.to, env.sms.countryCode).replace(/^\+/, '');
      if (!/^[1-9]\d{7,14}$/.test(to)) throw new Error('Supercode invalid destination');
      // Temporary operator-approved compatibility setting; HTTP is the current approved default; set allowHttp=false when TLS is available.
      const protocol = env.sms.supercode.allowHttp ? 'http' : 'https';
      let response: Response;
      try {
        response = await fetch(`${protocol}://sms.supercode.ps/API/SendJSON.aspx`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          redirect: 'error', signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({ id: apiId, sender, to, msg: encodeURIComponent(message.body), mode: '0' }),
        });
      } catch {
        throw new Error('Supercode transport failed; delivery status unknown');
      }

      let data: unknown;
      try { data = await response.json(); } catch { throw new Error('Supercode invalid response'); }
      const status = typeof data === 'object' && data !== null && 'STATUS' in data ? data.STATUS : undefined;
      const knownErrors = ['Authentication Failed', 'Insufficient Credit', 'IP Not Allowed', 'Invalid ID Parameter', 'Invalid SENDER Parameter', 'Invalid TO Parameters', 'Invalid MSG Parameter', 'Sender Not Allowed', 'No Valid Recipients!', 'Invalid Recipient', 'Validation Failed', 'Internal Error Occurred', 'System is upgrading'];
      if (typeof status === 'string' && knownErrors.includes(status)) {
        throw new Error('Supercode rejected: ' + status);
      }
      if (!response.ok) throw new Error('Supercode HTTP failure (' + response.status + ')');
      if (typeof data !== 'object' || data === null || !('STATUS' in data) ||
          data.STATUS !== 'Message Sent Successfully') {
        // Never expose echoed credentials, OTPs, or raw provider responses in logs.
        throw new Error('Supercode rejected message; check credit, sender and IP permissions');
      }
      return { accepted: true }; // Gateway acceptance is not handset delivery confirmation.
    },
  };
}
