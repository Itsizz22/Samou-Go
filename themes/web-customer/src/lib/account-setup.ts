const key = 'samou_account_setup_pending';
let pendingUser: string | null = null;
export function markAccountSetup(userId: string) {
  pendingUser = userId;
  try { sessionStorage.setItem(key, userId); } catch { /* Navigation still works without storage. */ }
}
export function needsAccountSetup(userId: string) {
  if (pendingUser === userId) return true;
  try { return sessionStorage.getItem(key) === userId; } catch { return false; }
}
export function finishAccountSetup() {
  pendingUser = null;
  try { sessionStorage.removeItem(key); } catch { /* Optional storage. */ }
}
