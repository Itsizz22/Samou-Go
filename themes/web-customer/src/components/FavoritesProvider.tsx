/**
 * Samou' Go — server-backed favorites.
 *
 * Favorites belong to the signed-in account, so the heart state lives in ONE
 * place (this provider) instead of a per-screen `useState`. The list is fetched
 * from `GET /favorites` and every toggle round-trips to `PUT`/`DELETE`, then
 * the local list is optimistically patched so the heart feels instant.
 *
 * Session handling is deliberately defensive. This app signs in through
 * screen-local `useAuth()` instances, so this provider subscribes to the
 * token lifecycle (`subscribeTokenChange`) to catch a sign-in or sign-out that
 * happened elsewhere and reconcile its own copy of the user.
 *
 * Guests: `toggle` returns `false` so the caller can route them to the
 * Favorites screen (which hosts the sign-in gate) — a favourite is tied to an
 * account and cannot be saved anonymously.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Store } from '@samou-go/shared-types';
import {
  ApiError,
  addFavorite,
  getFavorites,
  getToken,
  removeFavorite,
  subscribeTokenChange,
  useAuth,
} from '@/hooks/useApi';
import { useToast } from '@/hooks/useApi';

export interface FavoritesState {
  /** The full favorited stores, newest first. Empty while signed out. */
  stores: Store[];
  /** Favorites have been (re)conciliated with the session at least once. */
  ready: boolean;
  /** First fetch is still in flight — hearts should not read as "off". */
  loading: boolean;
  /** Store ids with a toggle in flight — so a double-tap cannot double-fire. */
  pending: string[];
  /** Last toggle/fetch failure, if any. */
  error: ApiError | null;
  isFavorite: (storeId: string) => boolean;
  /**
   * Optimistic add/remove. Resolves `false` when the customer is not signed
   * in — the caller should route them to the sign-in gate.
   */
  toggle: (storeId: string) => Promise<boolean>;
  /** Re-fetches from the server. Safe to pass straight to `onClick`. */
  reload: () => void;
}

const FavoritesContext = createContext<FavoritesState | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const toast = useToast();

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);

  const authRef = useRef(auth);
  authRef.current = auth;

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  // Load whenever the session (or an explicit reload) changes.
  useEffect(() => {
    if (!auth.ready || !auth.user) {
      setStores([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    getFavorites(controller.signal)
      .then((result) => {
        setStores(result.items);
        setError(null);
      })
      .catch((cause: unknown) => {
        const apiError =
          cause instanceof ApiError
            ? cause
            : new ApiError('UNKNOWN', cause instanceof Error ? cause.message : String(cause));
        if (apiError.isAuthError) {
          // The session died mid-flight; drop everything rather than show stale hearts.
          setStores([]);
        } else {
          setError(apiError);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [auth.ready, auth.user, nonce]);

  // Reconcile with sign-in/out that happened in another screen's `useAuth`.
  useEffect(() => {
    return subscribeTokenChange(() => {
      const signedInNow = Boolean(getToken());
      if (signedInNow && !authRef.current.user) {
        // A session appeared elsewhere — refresh our copy, then load favorites.
        void authRef.current.refresh().then(() => reload());
      } else if (!signedInNow && authRef.current.user) {
        setStores([]);
        authRef.current.setUser(null);
      }
    });
  }, [reload]);

  const isFavorite = useCallback(
    (storeId: string) => stores.some((store) => store.id === storeId),
    [stores]
  );

  const toggle = useCallback(
    async (storeId: string): Promise<boolean> => {
      if (!auth.user) return false;
      if (pending.includes(storeId)) return true;

      const wasFavorite = isFavorite(storeId);

      // Optimistic patch — the heart flips immediately.
      setStores((current) =>
        wasFavorite
          ? current.filter((store) => store.id !== storeId)
          : [...current, { id: storeId } as Store]
      );
      setPending((current) => [...current, storeId]);
      setError(null);

      try {
        if (wasFavorite) await removeFavorite(storeId);
        else await addFavorite(storeId);
        // The optimistic entry may lack display fields; pull the canonical list.
        reload();
        return true;
      } catch (cause) {
        const apiError =
          cause instanceof ApiError
            ? cause
            : new ApiError('UNKNOWN', cause instanceof Error ? cause.message : String(cause));
        setError(apiError);
        // Roll the heart back.
        setStores((current) =>
          wasFavorite
            ? [...current, { id: storeId } as Store]
            : current.filter((store) => store.id !== storeId)
        );
        toast.error('تعذّر تحديث المفضلة', apiError.message);
        return true;
      } finally {
        setPending((current) => current.filter((id) => id !== storeId));
      }
    },
    [auth.user, isFavorite, pending, reload, toast]
  );

  const value = useMemo<FavoritesState>(
    () => ({
      stores,
      ready: auth.ready,
      loading,
      pending,
      error,
      isFavorite,
      toggle,
      reload,
    }),
    [stores, auth.ready, loading, pending, error, isFavorite, toggle, reload]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesState {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used inside <FavoritesProvider>');
  return context;
}
