/**
 * Samou' Go — single sign-on (SSO) token hand-off.
 *
 * The seven themes share one origin in production (reverse proxy), so a JWT
 * written to localStorage by one app is read by the rest and no URL exchange is
 * needed. During local dev each Vite app runs on its own port, so localStorage
 * is NOT shared; the "unified login" flow therefore passes the freshly-issued
 * access token to the target app via a `?token=` query param.
 *
 * The receiving app ingests it with `consumeSsoToken()` on boot — stores the
 * token, strips it from the URL bar, and lets the normal `useAuth` hydration
 * (`GET /auth/me`) finish the sign-in. A `ref=sso` marker distinguishes the
 * hand-off from any other query string.
 */

import { getToken, setToken } from './api';
import type { UserRole } from '@samou-go/shared-types';

const TOKEN_PARAM = 'token';
const SSO_REF = 'sso';

/**
 * Best-effort role claim from a JWT payload. The API signs `{ role, phone }`
 * (`packages/api/src/lib/jwt.ts`), so the claim is always present for tokens
 * this project issued; anything unreadable yields `null`.
 */
function decodeRole(token: string): UserRole | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as { role?: unknown };
    const role = payload.role;
    return typeof role === 'string' ? (role as UserRole) : null;
  } catch {
    return null;
  }
}

/**
 * If the current URL carries an SSO hand-off (`?token=...&ref=sso`), store the
 * token and silently remove the secret from the address bar. When `allowedRoles`
 * is given, a token whose role this app does not serve is never stored — a
 * stale hand-off (browser history, restored tab) cannot authenticate the wrong
 * role on this app. Returns the consumed token, or `null` when there is
 * nothing to ingest (or the token was rejected by the role check).
 */
export function consumeSsoToken(allowedRoles?: readonly UserRole[]): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get(TOKEN_PARAM);
  const isSso = params.get('ref') === SSO_REF;
  if (!token || !isSso) return null;

  const role = decodeRole(token);
  const roleAllowed =
    allowedRoles === undefined ||
    allowedRoles.length === 0 ||
    (role !== null && allowedRoles.includes(role));

  // Strip the secret (and the marker) from the URL without triggering a reload.
  params.delete(TOKEN_PARAM);
  params.delete('ref');
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', next);

  if (!roleAllowed) return null;

  setToken(token);
  return token;
}

/**
 * Build a target-app URL with the current session's access token appended as an
 * SSO hand-off. Returns `undefined` when no token is available — the caller can
 * then fall back to a plain navigation (production same-origin path).
 */
export function buildSsoUrl(baseUrl: string): string {
  const token = getToken();
  if (!token) return baseUrl;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}token=${encodeURIComponent(token)}&ref=sso`;
}