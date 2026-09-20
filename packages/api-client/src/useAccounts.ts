/**
 * Samou' Go — Multi-Account Vault hook.
 *
 * React binding over `accountVault`. Keeps the saved-account list in sync
 * with storage, exposes `switchTo`/`remove`/`addSession`, and resolves the
 * profile of whatever account was just activated so the caller can commit it
 * through the auth instance (`auth.setUser(profile)`).
 *
 * `switchTo` confirms server-side push isolation and refreshes the destination
 * session before publishing it locally. Failed activation retains the current
 * identity so offline switching cannot leave old-account push ownership behind.
 */

import { useCallback, useEffect, useState } from 'react';
import type { PublicUser } from '@samou-go/shared-types';
import {
  addAccount,
  getActiveAccountId,
  getSavedAccounts,
  subscribeAccountsChange,
  type VaultAccount,
  type VaultSessionInput,
  MAX_VAULT_ACCOUNTS,
} from './accountVault';
import { activateSavedSession } from './api';
import { removeSavedSession } from './removeSavedSession';

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
    const account = getSavedAccounts().find(entry => entry.id === accountId);
    if (!account?.refreshToken) return null;
    setBusyId(accountId);
    try {
      const { user: profile } = await activateSavedSession(account.refreshToken);
      // Never commit a different identity from a stale saved snapshot.
      return profile?.id === accountId ? profile : null;
    } finally {
      setBusyId(null);
    }
  }, []);

  const remove = useCallback(async (accountId: string): Promise<AccountRemovalResult> => {
    setBusyId(accountId);
    try {
      return await removeSavedSession(accountId);
    } finally {
      setBusyId(null);
    }
  }, []);

  const full = accounts.length >= MAX_VAULT_ACCOUNTS;

  return { accounts, activeId, full, busyId, addSession, switchTo, remove };
}
