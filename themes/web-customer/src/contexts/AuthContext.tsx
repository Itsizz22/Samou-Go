/**
 * Samou' Go — Auth context provider.
 *
 * Wraps the `useAuth` hook into a React Context so that every component in
 * the tree shares a SINGLE auth instance. Without this, each screen that
 * calls `useAuth()` creates its own independent auth state — causing login
 * to set user on the screen's instance while the parent `App` component
 * still sees `user: null`, triggering an infinite redirect loop.
 *
 * Usage:
 *   1. Wrap the app tree with `<AuthProvider>`.
 *   2. Any component calls `useAuth()` — reads from context, same instance.
 */

import { createContext, useContext } from 'react';
import type { Auth } from '@samou-go/api-client';

export const AuthContext = createContext<Auth | null>(null);

/**
 * Consume the shared auth instance. Must be called inside <AuthProvider>.
 * Returns the same object everywhere — no duplicate instances.
 */
export function useSharedAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useSharedAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
