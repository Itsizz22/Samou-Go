/**
 * Samou' Go — role → in-app home path for the merged single-entry app.
 *
 * The Captain and Store Manager dashboards live inside the customer app under
 * `/captain/*` and `/store-manager/*`. Post-login and post-sign-up redirection
 * uses this single mapping — no `location.replace`, no cross-app bounce, so
 * role-based navigation can never loop.
 */

import { UserRole, type UserRole as UserRoleValue } from '@samou-go/shared-types';

export function roleHomePath(role: UserRoleValue): string {
  if (role === UserRole.CAPTAIN) return '/captain/dashboard';
  if (role === UserRole.STORE_MANAGER) return '/store-manager/orders';
  return '/';
}