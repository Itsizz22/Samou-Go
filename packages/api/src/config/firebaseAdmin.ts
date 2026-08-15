import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { serviceUnavailable } from '../lib/http-error';

/**
 * Firebase Admin SDK — verifies the ID tokens minted by Firebase Phone Auth.
 *
 * Note: firebase-admin v14 exports named functions only — the legacy
 * `admin.credential.cert(...)` / `admin.auth()` namespace no longer exists.
 * `cert(...)` below IS `admin.credential.cert(...)` and `getAuth(...)` IS
 * `admin.auth(...)` from the classic SDK.
 *
 * Credentials are resolved conditionally:
 *   1. `FIREBASE_PRIVATE_KEY` set (Production / Render) → `cert()` from
 *      `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`.
 *      The `\n` escapes are decoded because most dashboards re-encode them.
 *   2. Otherwise (local development) → `packages/api/firebase-service-account.json`.
 *      The file is gitignored (`packages/api/.gitignore`) and must never be
 *      committed.
 *
 * Initialisation happens once at module load, but ONLY when a credential is
 * resolvable — an unconfigured API still boots and `/auth/firebase-register`
 * answers a clean 503 instead of crashing every process. A corrupt local file
 * (invalid JSON) fails loudly at boot, as it should.
 */

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '../../firebase-service-account.json');

/** Resolves the service-account credential: env vars first, then the local JSON file. */
function resolveCredential(): ServiceAccount {
  const { projectId, clientEmail, privateKey } = env.firebaseAdmin ?? {};
  if (privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
  }
  if (existsSync(SERVICE_ACCOUNT_PATH)) {
    return JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8')) as ServiceAccount;
  }
  throw serviceUnavailable(
    'FIREBASE_NOT_CONFIGURED',
    'خدمة التحقق من Firebase غير مهيأة / Firebase verification is not configured'
  );
}

let app: App | null = null;

// Skipped under `NODE_ENV=test`: suites that boot the full app mock `config/env`
// without the `firebaseAdmin` block, and no test should load the real private key.
const hasEnvCredential = Boolean(env.firebaseAdmin?.privateKey);
const hasLocalFile = process.env.NODE_ENV !== 'test' && existsSync(SERVICE_ACCOUNT_PATH);

if (hasEnvCredential || hasLocalFile) {
  const existing = getApps().find(candidate => candidate.name === 'samou-go-admin');
  app = existing ?? initializeApp({ credential: cert(resolveCredential()) }, 'samou-go-admin');
}

/** The initialized Firebase Admin app, or a clean 503 when nothing is configured. */
export function firebaseAdminApp(): App {
  if (!app) {
    throw serviceUnavailable(
      'FIREBASE_NOT_CONFIGURED',
      'خدمة التحقق من Firebase غير مهيأة / Firebase verification is not configured'
    );
  }
  return app;
}

/** Verifies a Firebase ID token and returns its claims (e.g. `phone_number`). */
export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  return getAuth(firebaseAdminApp()).verifyIdToken(idToken);
}