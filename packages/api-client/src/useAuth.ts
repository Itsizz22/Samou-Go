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
 * Stored refresh credentials restore expired access tokens. A screen calls `useAuth()` once at the top
 * and renders `<SignInGate />` when `user` is null.
 *
 * NOTE: In web-customer, `useAuth` is overridden by a context-aware wrapper
 * (see `contexts/AuthContext.tsx`) so all screens share a single auth instance.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoginInput, PublicUser, UserRole } from "@samou-go/shared-types";
import {
  ApiError,
  clearTokens,
  getRefreshToken,
  getToken,
  login,
  logout,
  me,
  refreshAccessToken,
  subscribeTokenChange,
} from "./api";
import { syncActiveSession } from "./accountVault";
import { consumeSsoToken } from "./sso";

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
  /**
   * Re-fetches `GET /auth/me` and updates the cached profile in place.
   * Screens call this after `updateProfile()` or `setAvailability()` — both
   * endpoints return the same `PublicUser`, which can also be passed straight
   * to {@link Auth.setUser} to skip the round-trip.
   */
  refresh: () => Promise<PublicUser | null>;
  /**
   * Overwrites the cached profile with a payload returned by a mutation
   * (`updateProfile`, `setAvailability`). Cheaper than a round-trip and avoids
   * a flash.
   */
  setUser: (next: PublicUser | null) => void;
}

export interface UseAuthOptions {
  /**
   * Roles this app is built for. When provided, any session whose role is
   * NOT in the list is treated as a foreign token — a user who signed in on
   * another theme sharing this origin's localStorage (production reverse
   * proxy), or an SSO hand-off restored from a URL. The tokens are cleared
   * and the app stays signed out instead of rendering UI for the wrong role.
   * Omit for apps that accept every role.
   */
  allowedRoles?: readonly UserRole[];
}

export function useAuth(options: UseAuthOptions = {}): Auth {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const bootController = useRef<AbortController | null>(null);

  // Roles are fixed for an app's lifetime; the ref lets stable callbacks
  // read the app's allowed roles without restarting the boot effect.
  const allowedRolesRef = useRef(options.allowedRoles);
  allowedRolesRef.current = options.allowedRoles;

  const acceptsRole = useCallback((role: UserRole): boolean => {
    const allowed = allowedRolesRef.current;
    if (!allowed || allowed.length === 0) return true;
    return allowed.includes(role);
  }, []);

  /**
   * Every path that resolves a profile goes through here. A profile whose
   * role this app does not serve is rejected: the tokens are dropped so the
   * mismatch cannot resurface on the next mount, and the session stays
   * signed out.
   */
  const applyProfile = useCallback(
    (profile: PublicUser | null): PublicUser | null => {
      if (!profile) return null;
      if (acceptsRole(profile.role)) return profile;
      clearTokens();
      return null;
    },
    [acceptsRole],
  );

  /**
   * Every non-null profile that survives the role gate is committed through
   * here: state update + Multi-Account Vault bookkeeping. Covers flows that
   * establish a session without `login()` — SSO hand-off, self-registration —
   * as well as plain sign-in and refresh, so the vault list always mirrors the
   * accounts that actually signed in on this device.
   */
  const committedProfile = useCallback(
    (profile: PublicUser | null): PublicUser | null => {
      const accepted = applyProfile(profile);
      if (accepted) {
        try {
          syncActiveSession(accepted);
        } catch {
          /* Vault is best-effort; a failure here must not break sign-in. */
        }
      }
      if (mounted.current) setUserState(accepted);
      return accepted;
    },
    [applyProfile],
  );

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // Ingest any SSO hand-off token from the URL before checking storage, so a
    // staff member arriving via the unified-login redirect signs in straight
    // to their dashboard without re-entering credentials.
    consumeSsoToken(allowedRolesRef.current);

    // No stored credentials means no session to restore — nothing to wait for.
    if (!getToken() && !getRefreshToken()) {
      setReady(true);
      return () => {
        mounted.current = false;
      };
    }

    // Publish the profile only after the server verifies or refreshes the session.
    // Cached roles must not start protected dashboard requests during boot.
    const controller = new AbortController();
    bootController.current = controller;

    // No access token but a refresh token present → the previous session's
    // access token was dropped (or expired); restore it silently so app kills
    // and restarts do not force a re-login.
    const ensureAccessToken = async (): Promise<void> => {
      if (!getToken() && getRefreshToken()) {
        const refresh = getRefreshToken();
        if (refresh) {
          const restored = await refreshAccessToken(refresh, controller.signal);
          if (mounted.current && !controller.signal.aborted) committedProfile(restored.user);
          return;
        }
      }
      const profile = await me(controller.signal);
      if (mounted.current && !controller.signal.aborted) committedProfile(profile);
    };

    ensureAccessToken()
      .catch((cause: unknown) => {
        if (!mounted.current || controller.signal.aborted) return;
        // Only explicit authentication rejection invalidates stored credentials.
        if (cause instanceof ApiError && cause.isAuthError) clearTokens();
        if (cause instanceof ApiError && !cause.isAborted) setError(cause);
        setUserState(null);
      })
      .finally(() => {
        if (mounted.current && !controller.signal.aborted) setReady(true);
      });

    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [acceptsRole, committedProfile]);

  // Listen for token lifecycle changes (login / signOut / 401-clear).
  // IMPORTANT: We must NOT call me() here — it causes a redirect loop when
  // the server returns 401 (request() clears the token → listener fires →
  // me() → 401 → clear → listener → …). Instead, just track whether a
  // token exists; the boot effect above already verified it on mount.
  useEffect(() => {
    return subscribeTokenChange(() => {
      if (!getToken()) {
        // Token was cleared (signOut, 401, expired refresh).
        setUserState(null);
      }
      // If a NEW token was set (login), the signIn() callback above already
      // sets user state — no action needed here.
    });
  }, []);

  const signIn = useCallback(
    async (input: LoginInput): Promise<PublicUser | null> => {
      bootController.current?.abort();
      setPending(true);
      setError(null);
      try {
        const auth = await login(input);
        if (mounted.current) {
          const accepted = committedProfile(auth.user);
          return accepted;
        }
        return null;
      } catch (cause) {
        const apiError =
          cause instanceof ApiError
            ? cause
            : new ApiError(
                "UNKNOWN",
                cause instanceof Error ? cause.message : String(cause),
              );
        if (!(cause instanceof ApiError)) {
          Object.assign(apiError, {
            cause: cause instanceof Error ? cause : new Error(String(cause)),
          });
        }
        if (mounted.current) setError(apiError);
        return null;
      } finally {
        if (mounted.current) {
          setPending(false);
          setReady(true);
        }
      }
    },
    [committedProfile],
  );

  const signOut = useCallback(() => {
    bootController.current?.abort();
    setReady(true);
    // Ordered deliberately for multi-device selective logout:
    // 1. UI state drops immediately so the screen reacts even when offline.
    // 2. `logout()` captures the refresh token + this device's FCM token at the
    //    TOP of its body — BEFORE storage is cleared — and posts them to
    //    `/auth/logout` so the server revokes the session and unregisters only
    //    THIS device. Other devices of the same account stay signed in.
    // 3. `logout()` clears local tokens immediately after capturing them, so
    //    in-flight requests cannot restore a session while revocation runs.
    setUserState(null);
    setError(null);
    void logout().catch(() => {
      /* Local logout already completed; server revocation was best-effort. */
    });
  }, []);

  const refresh = useCallback(async (): Promise<PublicUser | null> => {
    try {
      const profile = await me();
      if (mounted.current) return committedProfile(profile);
      return null;
    } catch {
      return null;
    }
  }, [committedProfile]);

  const setUser = useCallback(
    (next: PublicUser | null) => {
      bootController.current?.abort();
      setReady(true);
      if (mounted.current) committedProfile(next);
    },
    [committedProfile],
  );

  return { user, ready, signIn, signOut, error, pending, refresh, setUser };
}
