import { getActiveAccountId, getSavedAccounts, forgetSignedOutAccount } from './accountVault';
import { getToken, getRefreshToken, logoutRefreshToken, clearTokens } from './api';

/** Confirm push revocation before forgetting a device login; never activate another account. */
export async function removeSavedSession(accountId: string) {
  const activeBefore = getActiveAccountId();
  const liveToken = getToken();
  const liveRefresh = getRefreshToken();
  const victim = getSavedAccounts().find(entry => entry.id === accountId);
  if (!victim) return { nextProfile: null, changedSession: false };
  if (victim.refreshToken) await logoutRefreshToken(victim.refreshToken);
  // A late response must not discard a newer login for the same account.
  const current = getSavedAccounts().find(entry => entry.id === accountId);
  if (current && (current.token !== victim.token || current.refreshToken !== victim.refreshToken)) {
    return { nextProfile: null, changedSession: false };
  }
  const changedSession = activeBefore === accountId && getToken() === liveToken && getRefreshToken() === liveRefresh;
  forgetSignedOutAccount(accountId);
  if (changedSession) clearTokens();
  return { nextProfile: null, changedSession };
}
