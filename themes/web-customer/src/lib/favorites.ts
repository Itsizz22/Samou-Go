/**
 * Favorites — persisted store ids, so the heart survives app restarts.
 * Keyed by store id; a tiny stable store is fine for a launch.
 */
const STORAGE_KEY = 'samou-go.favorites.v1';

export function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function writeFavorites(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* private mode — favorites just won't persist */
  }
}

export function toggleFavorite(current: string[], storeId: string): string[] {
  return current.includes(storeId)
    ? current.filter((id) => id !== storeId)
    : [...current, storeId];
}
