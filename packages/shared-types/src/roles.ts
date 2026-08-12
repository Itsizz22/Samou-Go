/**
 * Samou' Go — role → app routing.
 *
 * The seven front-ends are separate SPAs (one per role, plus shared flows),
 * so a signed-in user's role decides which app they should land in. This is
 * *client* routing intent only — authorization is always enforced again by the
 * API's `authorize(...)` middleware, never trusted to a redirect.
 */

import type { UserRole } from './enums';

/** Stable, port-agnostic key for every deployable front-end. */
export type AppKey =
  | 'customer'
  | 'store-details'
  | 'checkout'
  | 'order-tracking'
  | 'store-manager'
  | 'captain'
  | 'admin';

const ROLE_PRIMARY_APP: Record<UserRole, AppKey> = {
  CUSTOMER: 'customer',
  STORE_MANAGER: 'store-manager',
  CAPTAIN: 'captain',
  ADMIN: 'admin',
};

/**
 * The app a user of `role` should be redirected to after sign-in. Used by the
 * cross-app redirect helper in `@samou-go/api-client`.
 */
export function primaryAppForRole(role: UserRole): AppKey {
  return ROLE_PRIMARY_APP[role];
}

/** Lookup of the known apps to guard against a typo'd new app. */
export const APP_KEYS: readonly AppKey[] = [
  'customer',
  'store-details',
  'checkout',
  'order-tracking',
  'store-manager',
  'captain',
  'admin',
];