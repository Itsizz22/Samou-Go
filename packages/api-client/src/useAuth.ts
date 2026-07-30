/**
 * Samou' Go — sign-in state.
 *
 * Every screen that writes (`POST /orders`) or reads something owned by a
 * person (`GET /orders/:id`) needs a bearer token: in
 * `packages/api/src/modules/orders/orders.routes.ts` everything below
 * `ordersRouter.use(authenticate)` rejects an anonymous caller. Only
 * `POST /orders/quote` is public.
 *
 * This hook is the whole of the front-end's session handling:
 *
 *   - On mount, if `localStorage` already holds a token, it is verified with
 *     `GET /auth/me`. A token the server rejects is dropped rather than left to
 *     fail every later request.
 *   - `signIn` stores the new token (via `login`, which calls `setToken`).
 *   - `signOut` clears it locally and tells the server, which is stateless.
 *
 * There is no refresh-token dance and no context provider. A screen calls
 * `useAuth()` once at the top and renders `<SignInGate />` when `user` is null.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoginInput, PublicUser } from '@samou-go/shared-types';
import { ApiError, clearToken, getToken, login, logout, me } from './api';

export interface Auth {
  /** The signed-in profile, or `null` when nobody is signed in. */
  user: PublicUser | null;
  /**
   * `false` only while the stored token is being verified on mount. Screens
   * must wait for this before deciding to show a sign-in form, otherwise a
   * returning customer sees a login flash on every reload.
   */
  ready: boolean;
  /** Resolves to the profile, or `null` on failure — inspect `error`. */
  signIn: (input: LoginInput) => Promise<PublicUser | null>;
  signOut: () => void;
  /** The last sign-in failure. Cleared when a new attempt starts. */
  error: ApiError | null;
  /** A sign-in request is in flight. */
  pending: boolean;
}

export function useAuth(): Auth {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // No token means no session to restore — nothing to wait for.
    if (!getToken()) {
      setReady(true);
      return () => {
        mounted.current = false;
      };
    }

    const controller = new AbortController();

    me(controller.signal)
      .then((profile) => {
        if (!mounted.current) return;
        setUser(profile);
      })
      .catch((cause: unknown) => {
        if (!mounted.current) return;
        // An expired or revoked token is already cleared by `request()` on a
        // 401; do it here too so an offline probe does not leave a half state.
        if (cause instanceof ApiError && cause.isAuthError) clearToken();
        setUser(null);
      })
      .finally(() => {
        if (mounted.current) setReady(true);
      });

    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, []);

  const signIn = useCallback(async (input: LoginInput): Promise<PublicUser | null> => {
    setPending(true);
    setError(null);
    try {
      const auth = await login(input);
      if (mounted.current) setUser(auth.user);
      return auth.user;
    } catch (cause) {
      const apiError =
        cause instanceof ApiError
          ? cause
          : new ApiError('UNKNOWN', cause instanceof Error ? cause.message : String(cause));
      if (mounted.current) setError(apiError);
      return null;
    } finally {
      if (mounted.current) setPending(false);
    }
  }, []);

  const signOut = useCallback(() => {
    // Drop the local token first: the screen must react immediately even if the
    // network call to a stateless endpoint never lands.
    clearToken();
    setUser(null);
    setError(null);
    void logout().catch(() => {
      /* Already signed out locally — a failed round-trip changes nothing. */
    });
  }, []);

  return { user, ready, signIn, signOut, error, pending };
}
