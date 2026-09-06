/**
 * Samou' Go — Multi-Account Vault hook.
 *
 * React binding over `accountVault`. Keeps the saved-account list in sync
 * with storage, exposes `switchTo`/`remove`/`addSession`, and resolves the
 * profile of whatever account was just activated so the caller can commit it
 * through the auth instance (`auth.setUser(profile)`).
 *
 * `switchTo` does the full restore dance: activate the snapshot, then
 * `GET /auth/me`; if the stored access token is stale the request layer (or
 * the explicit refresh fallback) mints a fresh one using the account's
 * refresh token.
 */

import { useCallback, useEffect, useState } from 'react';
import type { PublicUser } from '@samou-go/shared-types';
import {
  addAccount,
  getActiveAccountId,
  getSavedAccounts,
  removeAccount,
  subscribeAccountsChange,
  switchAccount,
  type VaultAccount,
  type VaultSessionInput,
  MAX_VAULT_ACCOUNTS,
} from './accountVault';
import { getRefreshToken, logoutRefreshToken, me, refreshAccessToken } from './api';

export interface AccountRemovalResult {
  /**
   * Profile to commit when the removal changed the LIVE session — the newly
   * active account after a switch, or `null` after a full sign-out.
   */
  nextProfile: PublicUser | null;
  /** `false` when a non-active account was removed and nothing changed. */
  changedSession: boolean;
}

export interface UseAccountsResult {
  /** Saved accounts, most recently used first. */
  accounts: VaultAccount[];
  /** Id of the currently active account, or `null`. */
  activeId: string | null;
  /** Vault is full — hide the "add another account" affordance. */
  full: boolean;
  /** The account currently being switched/removed, for spinner states. */
  busyId: string | null;
  /** Records/activates a session (mirrors `accountVault.addAccount`). */
  addSession: (session: VaultSessionInput) => VaultAccount;
  /** Activates an account and resolves its profile. `null` on failure. */
  switchTo: (accountId: string) => Promise<PublicUser | null>;
  /** Removes an account; reports whether the live session changed. */
  remove: (accountId: string) => Promise<AccountRemovalResult>;
}

/** Resolves the CURRENT live session's profile, refreshing if stale. */
async function resolveLiveProfile(): Promise<PublicUser | null> {
  try {
    return await me();
  } catch {
    // The access snapshot may be expired; `me()` failing already let the
    // request layer try a silent refresh. As a backstop, refresh explicitly
    // with whatever refresh token the (now active) session holds.
    const refresh = getRefreshToken();
    if (!refresh) return null;
    try {
      await refreshAccessToken(refresh);
      return await me();
    } catch {
      return null;
    }
  }
}

export function useAccounts(): UseAccountsResult {
  const [accounts, setAccounts] = useState<VaultAccount[]>(() => getSavedAccounts());
  const [activeId, setActiveId] = useState<string | null>(() => getActiveAccountId());
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeAccountsChange(() => {
      setAccounts(getSavedAccounts());
      setActiveId(getActiveAccountId());
    });
  }, []);

  const addSession = useCallback((session: VaultSessionInput) => addAccount(session), []);

  const switchTo = useCallback(async (accountId: string): Promise<PublicUser | null> => {
    const account = switchAccount(accountId);
    if (!account) return null;
    setBusyId(accountId);
    try {
      return await resolveLiveProfile();
    } finally {
      setBusyId(null);
    }
  }, []);

  const remove = useCallback(async (accountId: string): Promise<AccountRemovalResult> => {
    const activeBefore = getActiveAccountId();
    const victim = getSavedAccounts().find((entry) => entry.id === accountId);

    // Best-effort server-side revocation of the removed account's refresh
    // token — a signed-out account must not be resurrectable.
    if (victim?.refreshToken) {
      try {
        await logoutRefreshToken(victim.refreshToken);
      } catch {
        /* Offline or already revoked — local removal still proceeds. */
      }
    }

    setBusyId(accountId);
    try {
      const next = removeAccount(accountId);
      if (activeBefore !== accountId) {
        // An inactive account was dropped — the live session is untouched.
        return { nextProfile: null, changedSession: false };
      }
      const nextProfile = next ? await resolveLiveProfile() : null;
      return { nextProfile, changedSession: true };
    } finally {
      setBusyId(null);
    }
  }, []);

  const full = accounts.length >= MAX_VAULT_ACCOUNTS;

  return { accounts, activeId, full, busyId, addSession, switchTo, remove };
}