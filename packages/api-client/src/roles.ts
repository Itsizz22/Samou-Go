/**
 * Samou' Go — role → app routing helpers for the front-ends.
 *
 * The server decides *authorization* (the `authorize(...)` middleware); these
 * helpers only decide *which app a signed-in user should be in* so a staff
 * member who opens the customer storefront is told where their app lives
 * instead of silently browsing a stranger's catalogue.
 */

import { primaryAppForRole, type AppKey } from '@samou-go/shared-types';
import type { UserRole } from '@samou-go/shared-types';
import { useAuth } from './useAuth';

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

/**
 * URL a user of `role` belongs at. In production the themes share one origin
 * (`/${appKey}` under the reverse proxy); during local dev each Vite app runs
 * on its own port, so a theme can point at the sibling app via the matching
 * `VITE_*_URL` env var.
 */
export function appUrl(app: AppKey): string {
  const overridden = (import.meta.env[DEV_ENV_KEY[app]] as string | undefined)?.trim();
  if (overridden) return overridden.replace(/\/+$/, '');
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

export interface RoleGate {
  ready: boolean;
  /** True when the signed-in user does not belong in the current app. */
  denied: boolean;
  /** The app the user should switch to (`null` while `ready` is false). */
  targetApp: AppKey | null;
  /** URL to hand the user when they end up in the wrong app. */
  targetUrl: string | null;
}

/**
 * Mount at an app root: when a signed-in role is not meant for this app, the
 * screen swaps to a notice pointing at `targetUrl` instead of the route tree.
 */
export function useRoleGate(app: AppKey): RoleGate {
  const auth = useAuth();
  const user = auth.user;
  const denied = auth.ready && user !== null && !allowedInApp(user.role, app);
  const targetApp = denied && user ? homeApp(user.role) : null;
  return {
    ready: auth.ready,
    denied,
    targetApp,
    targetUrl: targetApp ? appUrl(targetApp) : null,
  };
}