/**
 * Samou' Go — data-fetching hooks over `./api.ts`.
 *
 * Deliberately small: this app has no react-query or SWR, and adding one for
 * three endpoints would cost more than it saves. What these hooks do provide is
 * the part that is easy to get wrong by hand — every request is aborted when the
 * component unmounts or its inputs change, so a slow response can never write
 * into a dead component or overwrite a newer result.
 *
 * Every hook returns the same triple: `{ data, loading, error }` plus `reload`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  API_URL,
  ApiError,
  createCaptain,
  createStore,
  deleteDriver,
  deleteStore,
  deleteUser,
  getMyStores,
  getOrder,
  getPlatformSettings,
  getStore,
  getStoreManager,
  getStores,
  getWallet,
  listActiveOffers,
  listAllOffers,
  listOrders,
  listStoreOffers,
  listUsers,
  uploadImage,
  type ApiMeta,
  getMeta,
  getAdminStats,
  getAdminFinancials,
  type WalletSummary,
  type AdminFinancials,
} from './api';
import type {
  AdminCreateCaptainInput,
  AdminCreateStoreInput,
  AdminCreateStoreResult,
  AdminStats,
  FinalizeUploadResult,
  Offer,
  OrderDetail,
  OrderListQuery,
  OrderSummary,
  Paginated,
  PlatformSettings,
  PublicUser,
  Store,
  StoreListQuery,
  StoreWithCatalogue,
  UploadKind,
  UserListQuery,
} from '@samou-go/shared-types';

/* ---------------------------------------------------------------------------
 * Core
 * ------------------------------------------------------------------------- */

export interface Resource<T> {
  data: T | null;
  /** `true` for the first load only — a `reload` keeps the old data visible. */
  loading: boolean;
  /** `true` while a background refresh is in flight over existing data. */
  refreshing: boolean;
  error: ApiError | null;
  /** Re-runs the request. Safe to pass straight to `onClick`. */
  reload: () => void;
  /**
   * Alias of `reload` — used by error/retry cards so the handler reads as
   * `onClick={refresh}`. Same behaviour: re-runs the request.
   */
  refresh: () => void;
}

export interface ResourceOptions<T = unknown> {
  /** Skip the request entirely — for dependent queries with no id yet. */
  enabled?: boolean;
  /** Re-fetch every N ms while mounted. Used by the order-tracking screen. */
  pollMs?: number;
  /**
   * Halts polling once `data` satisfies this predicate (e.g. an order reached
   * `DELIVERED` / `CANCELLED`). The interval is dropped the moment the fetched
   * data matches, so a terminal order stops hitting the API.
   */
  stopWhen?: (data: T | null) => boolean;
}

/**
 * Runs `load` whenever `key` changes and tracks its lifecycle.
 *
 * `key` rather than a dependency array: the loader is a closure that changes
 * identity on every render, so the honest trigger is a serialised description
 * of the inputs. Callers build it with `JSON.stringify` or a template string.
 */
export function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  options: ResourceOptions<T> = {}
): Resource<T> {
  const { enabled = true, pollMs, stopWhen } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  // The loader is re-created every render; keep the latest without re-firing.
  const loadRef = useRef(load);
  loadRef.current = load;

  // Distinguishes "first load" (show a skeleton) from "refresh" (keep the data).
  const hasDataRef = useRef(false);

  // Latest `stopWhen` without re-firing the polling effect on every render.
  const stopWhenRef = useRef(stopWhen);
  stopWhenRef.current = stopWhen;

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    if (hasDataRef.current) setRefreshing(true);
    else setLoading(true);

    loadRef
      .current(controller.signal)
      .then((result) => {
        if (cancelled) return;
        hasDataRef.current = true;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof ApiError
            ? cause
            : new ApiError('UNKNOWN', cause instanceof Error ? cause.message : String(cause))
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, nonce]);

  useEffect(() => {
    if (!enabled || !pollMs) return;
    if (stopWhenRef.current?.(data)) return;
    const timer = setInterval(reload, pollMs);
    return () => clearInterval(timer);
  }, [enabled, pollMs, reload, data]);

  return { data, loading, refreshing, error, reload, refresh: reload };
}

/* ---------------------------------------------------------------------------
 * Mutations
 * ------------------------------------------------------------------------- */

export interface Mutation<TInput, TResult> {
  run: (input: TInput) => Promise<TResult | null>;
  data: TResult | null;
  pending: boolean;
  error: ApiError | null;
  reset: () => void;
}

/**
 * One-shot writes — placing an order, signing in.
 */
export function useMutation<TInput, TResult>(
  perform: (input: TInput, signal: AbortSignal) => Promise<TResult>
): Mutation<TInput, TResult> {
  const [data, setData] = useState<TResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const performRef = useRef(perform);
  performRef.current = perform;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Guards against double-submits: a second `run` while one is in flight is a
  // no-op. The ref (not state) carries the lock so two taps in the same frame
  // cannot both read `pending === false`.
  const pendingRef = useRef(false);

  const run = useCallback(async (input: TInput): Promise<TResult | null> => {
    if (pendingRef.current) return null;
    pendingRef.current = true;
    const controller = new AbortController();
    setPending(true);
    setError(null);
    try {
      const result = await performRef.current(input, controller.signal);
      if (mounted.current) setData(result);
      return result;
    } catch (cause) {
      const apiError =
        cause instanceof ApiError
          ? cause
          : new ApiError('UNKNOWN', cause instanceof Error ? cause.message : String(cause));
      if (mounted.current) setError(apiError);
      return null;
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { run, data, pending, error, reset };
}

/* ---------------------------------------------------------------------------
 * Endpoint hooks
 * ------------------------------------------------------------------------- */

/** `GET /stores` — the home screen's store list. */
export function useStores(
  query: StoreListQuery = {},
  options?: ResourceOptions<Paginated<Store>>,
  auth = false,
): Resource<Paginated<Store>> {
  const key = `stores:${auth ? 'auth:' : ''}${JSON.stringify(query)}`;
  return useResource(key, (signal) => getStores(query, signal, auth), options);
}

/** `GET /stores/:id` — store detail with categories and products. */
export function useStore(
  storeId: string | null | undefined,
  options?: ResourceOptions<StoreWithCatalogue>
): Resource<StoreWithCatalogue> {
  return useResource(`store:${storeId ?? ''}`, (signal) => getStore(storeId as string, signal), {
    ...options,
    enabled: Boolean(storeId) && (options?.enabled ?? true),
  });
}

/** `GET /stores/:id/full` — full catalogue for the store manager. */
export function useStoreManager(
  storeId: string | null | undefined,
  options?: ResourceOptions<StoreWithCatalogue>
): Resource<StoreWithCatalogue> {
  return useResource(
    `store-manager:${storeId ?? ''}`,
    (signal) => getStoreManager(storeId as string, signal),
    { ...options, enabled: Boolean(storeId) && (options?.enabled ?? true) }
  );
}

/** `GET /stores/mine` — every store the signed-in manager manages. */
export function useMyStores(
  options?: ResourceOptions<Store[]>
): Resource<Store[]> {
  // `getMyStores` sends the bearer token itself; `enabled` stays in the
  // caller's hands so the dashboard can wait for a signed-in user.
  return useResource('stores:mine', (signal) => getMyStores(signal), options);
}

/** `GET /stores/:storeId/offers/manage` — all offers (incl. inactive) for the manager panel. */
export function useStoreOffers(
  storeId: string | null | undefined,
  options?: ResourceOptions<Paginated<Offer>>
): Resource<Paginated<Offer>> {
  return useResource(
    `store-offers:${storeId ?? ''}`,
    (signal) => listStoreOffers(storeId as string, signal),
    { ...options, enabled: Boolean(storeId) && (options?.enabled ?? true) }
  );
}

/** `GET /stores/:storeId/offers` — active offers for the customer store detail. */
export function useOffersForStore(
  storeId: string | null | undefined,
  options?: ResourceOptions<Paginated<Offer>>
): Resource<Paginated<Offer>> {
  return useResource(
    `offers-for-store:${storeId ?? ''}`,
    (signal) => listActiveOffers(storeId as string, signal),
    { ...options, enabled: Boolean(storeId) && (options?.enabled ?? true) }
  );
}

/** `GET /offers` — the home-screen feed of active offers across all approved stores. */
export function useAllOffers(options?: ResourceOptions<Paginated<Offer>>): Resource<Paginated<Offer>> {
  return useResource('offers:all', (signal) => listAllOffers(signal), options);
}

/** `GET /orders/:id` — order tracking. */
export function useOrder(
  orderId: string | null | undefined,
  options?: ResourceOptions<OrderDetail>
): Resource<OrderDetail> {
  return useResource(`order:${orderId ?? ''}`, (signal) => getOrder(orderId as string, signal), {
    ...options,
    enabled: Boolean(orderId) && (options?.enabled ?? true),
  });
}

/** `GET /orders` — the signed-in customer's own orders. */
export function useOrders(
  query: OrderListQuery = {},
  options?: ResourceOptions<Paginated<OrderSummary>>
): Resource<Paginated<OrderSummary>> {
  const key = `orders:${JSON.stringify(query)}`;
  return useResource(key, (signal) => listOrders(query, signal), options);
}

/** `GET /meta` — the live delivery tariff. */
export function useApiMeta(options?: ResourceOptions<ApiMeta>): Resource<ApiMeta> {
  return useResource('meta', (signal) => getMeta(signal), options);
}

/** `GET /users` — admin paginated user list. */
export function useUsers(
  query: UserListQuery = {},
  options?: ResourceOptions<Paginated<PublicUser>>
): Resource<Paginated<PublicUser>> {
  const key = `users:${JSON.stringify(query)}`;
  return useResource(key, (signal) => listUsers(query, signal), options);
}

/** `GET /admin/stats` — the admin dashboard. */
export function useAdminStats(options?: ResourceOptions<AdminStats>): Resource<AdminStats> {
  return useResource('admin-stats', (signal) => getAdminStats(signal), options);
}

/** POST /admin/stores — admin creates a store + manager account. */
export function useCreateStore(): Mutation<AdminCreateStoreInput, AdminCreateStoreResult> {
  return useMutation<AdminCreateStoreInput, AdminCreateStoreResult>(
    (input, signal) => createStore(input, signal)
  );
}

/** POST /admin/captains — admin creates a new delivery captain. */
export function useCreateCaptain(): Mutation<AdminCreateCaptainInput, PublicUser> {
  return useMutation<AdminCreateCaptainInput, PublicUser>(
    (input, signal) => createCaptain(input, signal)
  );
}

/** DELETE /admin/stores/:id — closes a store and its owner account. */
export function useDeleteStore(): Mutation<string, { removed: boolean }> {
  return useMutation<string, { removed: boolean }>((storeId, signal) =>
    deleteStore(storeId, signal)
  );
}

/** DELETE /admin/drivers/:id — removes a driver and their profile data. */
export function useDeleteDriver(): Mutation<string, { removed: boolean }> {
  return useMutation<string, { removed: boolean }>((driverId, signal) =>
    deleteDriver(driverId, signal)
  );
}

/** DELETE /admin/users/:userId — safely deactivates a user account. */
export function useDeleteUser(): Mutation<string, { removed: boolean }> {
  return useMutation<string, { removed: boolean }>((userId, signal) =>
    deleteUser(userId, signal)
  );
}

/** GET /platform/settings — the platform economy knobs. */
export function usePlatformSettings(
  options?: ResourceOptions<PlatformSettings>
): Resource<PlatformSettings> {
  return useResource('platform-settings', (signal) => getPlatformSettings(signal), options);
}

/** GET /platform/wallet — the caller's wallet + recent settlements. */
export function useWallet(options?: ResourceOptions<WalletSummary | null>): Resource<WalletSummary | null> {
  return useResource('platform-wallet', (signal) => getWallet(signal), options);
}

/* ---------------------------------------------------------------------------
 * Image uploads
 * ------------------------------------------------------------------------- */

export interface UploadImageInput {
  kind: UploadKind;
  resourceId?: string;
  /** `store` kind only — which image slot the upload targets. */
  purpose?: 'logo' | 'cover' | 'image';
  file: Blob;
}

export function useUploadImage(): Mutation<UploadImageInput, FinalizeUploadResult> {
  return useMutation<UploadImageInput, FinalizeUploadResult>(
    ({ kind, resourceId, purpose, file }, signal) =>
      uploadImage({ kind, resourceId, purpose }, file, signal)
  );
}

/* ---------------------------------------------------------------------------
 * Real-time SSE Events
 * ------------------------------------------------------------------------- */

/**
 * `useOrderEvent` — Server-Sent Events hook that follows a single order's
 * status changes in real time.
 */
export function useOrderEvent(
  orderId: string | null | undefined,
  options?: { onUpdate?: (detail: OrderDetail) => void; pollMs?: number }
): {
  detail: OrderDetail | null;
  loading: boolean;
  refreshing: boolean;
  error: ApiError | null;
  reload: () => void;
} {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  const loadRef = useRef<(signal: AbortSignal) => Promise<OrderDetail>>(
    (signal) => getOrder(orderId as string, signal)
  );
  loadRef.current = (signal) => getOrder(orderId as string, signal);

  const onUpdateRef = useRef(options?.onUpdate);
  onUpdateRef.current = options?.onUpdate;

  /** Fetches the fresh detail; resolves `false` when the fetch fails. */
  const fetchDetail = useCallback(async (): Promise<boolean> => {
    try {
      const updated = await loadRef.current(new AbortController().signal);
      setDetail(updated);
      setLoading(false);
      setRefreshing(false);
      if (onUpdateRef.current) onUpdateRef.current(updated);
      return true;
    } catch {
      return false;
    }
  }, []);

  // ——— SSE connection (push channel) ———
  useEffect(() => {
    // No order to follow: nothing is loading, nothing to keep open.
    if (!orderId) {
      setLoading(false);
      return;
    }

    // Path must match `ordersRouter.get('/:orderId/events')` on the API — the
    // id goes in the middle, not last. `EventSource` cannot set an
    // `Authorization` header, so this stream is anonymous by design and the
    // server sends status transitions only (no PII); `withCredentials` is kept
    // so the allow-list/credentials handshake stays consistent with `fetch`.
    const url = `${API_URL}/orders/${orderId}/events?t=${Date.now()}`;
    const source = new EventSource(url, { withCredentials: true });

    eventSourceRef.current = source;

    source.onopen = () => {
      setLoading(false);
      setError(null);
    };

    source.onmessage = () => {
      void fetchDetail();
    };

    source.onerror = () => {
      // Do NOT `source.close()` here: EventSource auto-reconnects with an
      // exponential backoff of its own, so the stream heals itself when the
      // network or the server comes back. We only surface the outage to the UI
      // and clear it on the next successful `onopen`.
      setError(new ApiError('SSE_ERROR', 'Connection lost — reconnecting…'));
    };

    return () => {
      if (eventSourceRef.current === source) eventSourceRef.current = null;
      source.close();
    };
  }, [orderId, fetchDetail]);

  // ——— polling safety net ———
  // Runs whenever SSE is missing or a push was missed; `pollMs: 0` disables it
  // (a terminal order has nothing left to watch).
  const pollMs = options?.pollMs ?? 15_000;
  useEffect(() => {
    if (!orderId || pollMs <= 0) return;
    const interval = setInterval(() => {
      void (async () => {
        setRefreshing(true);
        const ok = await fetchDetail();
        if (!ok) setRefreshing(false);
      })();
    }, pollMs);
    return () => clearInterval(interval);
  }, [orderId, pollMs, fetchDetail]);

  const reload = useCallback(() => {
    setRefreshing(true);
    void (async () => {
      const ok = await fetchDetail();
      if (!ok) setError(new ApiError('RELOAD_ERROR', 'Reload failed'));
    })();
  }, [fetchDetail]);

  return { detail, loading, refreshing, error, reload };
}

/**
 * Vibrate the device briefly — used for tap feedback.
 * Safe to call in the browser; no-op on server-side rendering.
 */
export function hapticTap() {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

/**
 * Vibrate to confirm an action — distinct pattern from hapticTap.
 * Safe to call in the browser; no-op on server-side rendering.
 */
export function hapticConfirm() {
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([20, 50, 20]);
  }
}

/** GET /platform/admin/financials — wallets, settlements and delivered revenue. */
export function useAdminFinancials(options?: ResourceOptions<AdminFinancials>): Resource<AdminFinancials> {
  return useResource('admin-financials', signal => getAdminFinancials(signal), options);
}
