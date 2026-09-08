/**
 * Samou' Go — role → app routing helpers for the front-ends.
 *
 * The server decides *authorization* (the `authorize(...)` middleware); these
 * helpers only decide *which app a signed-in user should be in* so a staff
 * member who opens the customer storefront is told where their app lives
 * instead of silently browsing a stranger's catalogue.
 */

import { useEffect } from 'react';
import { primaryAppForRole, type AppKey } from '@samou-go/shared-types';
import type { UserRole } from '@samou-go/shared-types';
import { useAuth } from './useAuth';
import { buildSsoUrl } from './sso';

/** On the production origin the seven apps sit next to each other (reverse proxy). */
export function appPath(app: AppKey): string {
  return `/${app}`;
}

const DEV_ENV_KEY: Record<AppKey, string> = {
  customer: 'VITE_CUSTOMER_URL',
  'store-details': 'VITE_STORE_DETAILS_URL',
  checkout: 'VITE_CHECKOUT_URL',
  'order-tracking': 'VITE_ORDER_TRACKING_URL',
  'store-manager': 'VITE_STORE_MANAGER_URL',
  captain: 'VITE_CAPTAIN_URL',
  admin: 'VITE_ADMIN_URL',
};

/** Resolve explicit overrides, separate Vercel origins, local Vite ports, or a custom reverse proxy. */
export function appUrl(app: AppKey): string {
  const overridden = (import.meta.env[DEV_ENV_KEY[app]] as string | undefined)?.trim();
  if (overridden) return overridden.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.endsWith('.vercel.app')) return `https://samou-go-${app}.vercel.app`;
    if (host === 'localhost' || host === '127.0.0.1') {
      const ports: Record<AppKey, number> = { customer: 5173, 'store-details': 5174, checkout: 5175, 'order-tracking': 5176, 'store-manager': 5177, captain: 5178, admin: 5179 };
      return `http://${host}:${ports[app]}`;
    }
  }
  return appPath(app);
}

/** The user's designated app for a role — mirrors the shared-types map. */
export function homeApp(role: UserRole): AppKey {
  return primaryAppForRole(role);
}

export function roleHomeUrl(role: UserRole): string {
  return appUrl(homeApp(role));
}

/** True when `app` is the designated home for `role`. */
export function allowedInApp(role: UserRole, app: AppKey): boolean {
  return homeApp(role) === app;
}

/**
 * Mount at an app root for the **unified login** flow. Once the auth session
 * resolves and the signed-in user's role does not belong in `app`, the current
 * screen is immediately replaced by that role's home app (its `VITE_*_URL`, or
 * `/${appKey}` on the production origin). This replaces the old "access denied"
 * dead-ends: any user can sign in anywhere and lands in their own workspace
 * without an error screen.
 *
 * Renders nothing — it only performs the navigation.
 */
export function useRoleRedirect(app: AppKey): void {
  const auth = useAuth();
  const user = auth.user;

  useEffect(() => {
    if (!auth.ready || !user) return;
    if (allowedInApp(user.role, app)) return;
    const target = roleHomeUrl(user.role);
    // Guard against a redirect loop. In local dev each Vite app is its own SPA
    // on a separate port, so when no `VITE_*_URL` is configured `appUrl` falls
    // back to a same-origin relative path (`/${appKey}`) that only reloads the
    // *current* app — redirecting there loops forever. In production the seven
    // apps share one origin (reverse proxy), so the relative path is correct.
    if (import.meta.env.DEV && target.startsWith('/')) return;
    // In local dev each app lives on its own origin, so localStorage is NOT
    // shared and the target app cannot read this session's token. Append the
    // access token as an SSO hand-off (`?token=..&ref=sso`); the target's
    // `consumeSsoToken()` ingests it on boot. In production the apps share one
    // origin, so the relative path already carries the token via localStorage.
    if (import.meta.env.DEV) {
      window.location.replace(buildSsoUrl(target));
      return;
    }
    window.location.replace(target);
    // `roleHomeUrl` depends only on the role; auth/user captured in the closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.ready, user, app]);
}