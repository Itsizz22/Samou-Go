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
  getOrder,
  getStore,
  getStoreManager,
  getStores,
  listOrders,
  listUsers,
  uploadImage,
  type ApiMeta,
  getMeta,
  getAdminStats,
} from './api';
import type {
  AdminCreateCaptainInput,
  AdminCreateStoreInput,
  AdminCreateStoreResult,
  AdminStats,
  FinalizeUploadResult,
  OrderDetail,
  OrderListQuery,
  OrderSummary,
  Paginated,
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

  const run = useCallback(async (input: TInput): Promise<TResult | null> => {
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
  options?: ResourceOptions<Paginated<Store>>
): Resource<Paginated<Store>> {
  const key = `stores:${JSON.stringify(query)}`;
  return useResource(key, (signal) => getStores(query, signal), options);
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

/**
 * `GET /stores/:id/full` — full catalogue for the store manager.
 */
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

/* ---------------------------------------------------------------------------
 * Image uploads
 * ------------------------------------------------------------------------- */

export interface UploadImageInput {
  kind: UploadKind;
  resourceId?: string;
  file: Blob;
}

export function useUploadImage(): Mutation<UploadImageInput, FinalizeUploadResult> {
  return useMutation<UploadImageInput, FinalizeUploadResult>(
    ({ kind, resourceId, file }, signal) =>
      uploadImage({ kind, resourceId }, file, signal)
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

    const url = `${API_URL}/orders/events/${orderId}?t=${Date.now()}`;
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
      eventSourceRef.current = null;
      source.close();
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