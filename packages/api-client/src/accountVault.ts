/**
 * Samou' Go — Multi-Account Vault.
 *
 * Lets one device hold up to three saved sign-ins and switch between them
 * instantly, without ever forcing a re-login of the account being left
 * behind. One row per user:
 *
 *   { id, phone, name, role, token, refreshToken, avatar, lastActiveAt }
 *
 * The row whose `token` matches the LIVE session (`getToken()`), or failing
 * that the stored `samou_quick_active_account` id, is the active account.
 * Token snapshots are realigned every time a pair is re-issued (`login`,
 * `verifyOtp`, refresh — see `api.ts`), so switching back to an older
 * account keeps working even after its access token expired.
 *
 * Storage keys are separate from the live-session keys:
 *   - `samou_quick_accounts`    — JSON array of saved accounts
 *   - `samou_quick_active_account` — id of the currently active account
 *
 * NOTE: this module and `api.ts` import each other on purpose. Both only call
 * the other inside function bodies (never at module load), so the cycle is
 * safe in Vite/ESM and CJS alike.
 */

import type { PublicUser, UserRole } from '@samou-go/shared-types';
import {
  clearTokens,
  getRefreshToken,
  getToken,
  setRefreshToken,
  setToken,
} from './api';

export interface VaultAccount {
  /** The user id — the deduplication key across all accounts. */
  id: string;
  /** Canonical `05XXXXXXXX` mobile. */
  phone: string;
  name: string;
  role: UserRole;
  /** Access-token snapshot. May be expired — the request layer refreshes. */
  token: string;
  /** Refresh-token snapshot, used to restore the session seamlessly. */
  refreshToken: string | null;
  /** `profileImageUrl`, so the list can show the right avatar. */
  avatar: string | null;
  /** ISO timestamp; LRU order decides which account is evicted at the cap. */
  lastActiveAt: string;
}

/** What `addAccount`/`syncActiveSession` need to record or update an account. */
export interface VaultSessionInput {
  user: Pick<PublicUser, 'id' | 'name' | 'phone' | 'role' | 'profileImageUrl'>;
  accessToken: string | null;
  refreshToken: string | null;
}

export const MAX_VAULT_ACCOUNTS = 3;

const VAULT_STORAGE_KEY = 'samou_quick_accounts';
const VAULT_ACTIVE_KEY = 'samou_quick_active_account';

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeAccountsChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* A listener must never take the vault down with it. */
    }
  }
}

/**
 * A usable token snapshot is a non-empty opaque string. The literal
 * `"null"`/`"undefined"` leftovers a corrupt storage entry can carry are NOT
 * tokens and must never be handed to the session layer.
 */
function usableToken(token: string | null | undefined): token is string {
  if (!token) return false;
  const trimmed = token.trim();
  return trimmed.length > 0 && trimmed !== 'null' && trimmed !== 'undefined';
}

function now(): string {
  return new Date().toISOString();
}

function readAccounts(): VaultAccount[] {
  try {
    const raw = window.localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is VaultAccount => {
        const candidate = entry as Partial<VaultAccount>;
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.phone === 'string' &&
          typeof candidate.name === 'string' &&
          typeof candidate.role === 'string' &&
          typeof candidate.token === 'string'
        );
      })
      .slice(0, MAX_VAULT_ACCOUNTS);
  } catch {
    return [];
  }
}

function writeAccounts(accounts: VaultAccount[]): void {
  try {
    window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    /* Private mode / quota — the in-memory list keeps working this session. */
  }
}

function readActiveId(): string | null {
  try {
    return window.localStorage.getItem(VAULT_ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActiveId(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(VAULT_ACTIVE_KEY);
    else window.localStorage.setItem(VAULT_ACTIVE_KEY, id);
  } catch {
    /* Best effort — the live-session tokens still rule. */
  }
}

/** The saved accounts, newest-active first, capped at `MAX_VAULT_ACCOUNTS`. */
export function getSavedAccounts(): VaultAccount[] {
  return readAccounts();
}

/**
 * The id of the active account, healed when storage desyncs: the row matching
 * the CURRENT live token wins, then the most recently active row, then null.
 */
export function getActiveAccountId(): string | null {
  const stored = readActiveId();
  const accounts = readAccounts();
  if (stored && accounts.some((account) => account.id === stored)) return stored;

  const live = getToken();
  if (usableToken(live)) {
    const byToken = accounts.find((account) => account.token === live);
    if (byToken) return byToken.id;
  }
  const newest = [...accounts].sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  )[0];
  return newest?.id ?? null;
}

/** The active account row, or `null` when the device has no saved accounts. */
export function getActiveAccount(): VaultAccount | null {
  const id = getActiveAccountId();
  return readAccounts().find((account) => account.id === id) ?? null;
}

/**
 * Records a session into the vault and makes it the ACTIVE account.
 * Existing rows are updated in place (name, avatar, tokens); when the cap is
 * reached the least-recently-used account is evicted. Callers use this after
 * a successful login / OTP verify / token refresh.
 */
export function addAccount(session: VaultSessionInput): VaultAccount {
  const existing = readAccounts().find((account) => account.id === session.user.id);
  const next: VaultAccount = {
    id: session.user.id,
    phone: session.user.phone,
    name: session.user.name,
    role: session.user.role,
    token: usableToken(session.accessToken) ? session.accessToken : (existing?.token ?? ''),
    refreshToken: usableToken(session.refreshToken)
      ? session.refreshToken
      : (existing?.refreshToken ?? null),
    avatar: session.user.profileImageUrl ?? existing?.avatar ?? null,
    lastActiveAt: now(),
  };

  let accounts = [next, ...readAccounts().filter((account) => account.id !== next.id)];
  if (accounts.length > MAX_VAULT_ACCOUNTS) {
    accounts = accounts
      .sort(
        (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
      )
      .slice(0, MAX_VAULT_ACCOUNTS);
  }

  writeAccounts(accounts);
  writeActiveId(next.id);
  notifyListeners();
  return next;
}

/**
 * Activates a saved account: its token snapshots become the LIVE session and
 * its id becomes the active one. Returns the activated row, or `null` when the
 * id is not in the vault. The caller then resolves the profile (`GET /auth/me`)
 * and commits it through `useAuth`, which re-renders with the new identity.
 */
export function switchAccount(accountId: string): VaultAccount | null {
  const account = readAccounts().find((entry) => entry.id === accountId);
  if (!account) return null;

  const refreshed = { ...account, lastActiveAt: now() };
  writeAccounts(
    readAccounts().map((entry) => (entry.id === accountId ? refreshed : entry)),
  );
  writeActiveId(accountId);

  // Handing the snapshot over also fires the token-change listeners, so any
  // subscribed UI (favorites, orders) reconciles with the new session.
  setToken(refreshed.token);
  setRefreshToken(refreshed.refreshToken);
  notifyListeners();
  return refreshed;
}

/**
 * Removes an account from the vault. When it was the ACTIVE one, the most
 * recently used remaining account becomes the live session (its tokens are
 * applied); when nothing remains the whole session is cleared. Returns the
 * account that is active afterwards, or `null` when fully signed out.
 */
export function removeAccount(accountId: string): VaultAccount | null {
  const wasActive = getActiveAccountId() === accountId;
  const remaining = readAccounts().filter((entry) => entry.id !== accountId);

  if (wasActive) {
    const next = [...remaining].sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
    )[0];

    if (next) {
      const refreshed = { ...next, lastActiveAt: now() };
      writeAccounts([
        refreshed,
        ...remaining.filter((entry) => entry.id !== refreshed.id),
      ]);
      writeActiveId(refreshed.id);
      setToken(refreshed.token);
      setRefreshToken(refreshed.refreshToken);
      notifyListeners();
      return refreshed;
    }

    writeAccounts(remaining);
    writeActiveId(null);
    clearTokens();
    notifyListeners();
    return null;
  }

  writeAccounts(remaining);
  notifyListeners();
  // Removing an inactive account leaves the live session untouched.
  return getActiveAccount();
}

/**
 * Records (or refreshes) the account behind the CURRENT live session — the
 * choke point `useAuth` calls whenever a profile is committed. Covers flows
 * that store a token without `login()` (SSO hand-off, self-registration).
 */
export function syncActiveSession(
  user: Pick<PublicUser, 'id' | 'name' | 'phone' | 'role' | 'profileImageUrl'>,
): VaultAccount | null {
  const token = getToken();
  if (!usableToken(token)) return getActiveAccount();
  return addAccount({ user, accessToken: token, refreshToken: getRefreshToken() });
}

/**
 * Keeps the ACTIVE account's token snapshots aligned with the live session
 * after an internal rotation (`refreshSessionIfPossible`). Without this a
 * later `switchAccount` back to that account would restore a stale refresh
 * token the server already invalidated.
 */
export function updateCurrentSessionTokens(
  accessToken: string | null,
  refreshToken: string | null,
): void {
  const activeId = readActiveId();
  if (!activeId) return;
  const accounts = readAccounts();
  const current = accounts.find((entry) => entry.id === activeId);
  if (!current) return;

  writeAccounts(
    accounts.map((entry) =>
      entry.id === activeId
        ? {
            ...entry,
            token: usableToken(accessToken) ? accessToken : entry.token,
            refreshToken: usableToken(refreshToken)
              ? refreshToken
              : entry.refreshToken,
          }
        : entry,
    ),
  );
  notifyListeners();
}