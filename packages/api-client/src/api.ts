/**
 * Samou' Go — HTTP client for the Express API.
 *
 * The single place in the monorepo that knows the API exists over HTTP. Every
 * front-end imports typed functions from here and never touches `fetch`
 * directly.
 *
 * Browser-only: it reads `import.meta.env` and `localStorage`, so it must never
 * be imported by `packages/api`. That is why this package publishes raw source
 * with no CJS build.
 *
 * Types come from `@samou-go/shared-types`, the same package the server builds
 * its responses from, so a contract change breaks the build here rather than at
 * runtime in someone's hand in Samou'.
 *
 * Three things this module guarantees to its callers:
 *
 *   1. It unwraps the `{ success, data }` envelope. Callers receive the payload.
 *   2. Every failure — HTTP, network, timeout, malformed body — arrives as an
 *      `ApiError` with a machine-readable `code` and an Arabic message that is
 *      safe to render.
 *   3. It never sends money. `POST /orders` carries the basket and the address;
 *      the server prices it. See DESIGN_SYSTEM.md §8.
 */

import type {
  ApiFieldError,
  ApiResponse,
  AuthResponse,
  CreateOrderInput,
  LoginInput,
  OrderDetail,
  OrderListQuery,
  OrderQuote,
  OrderSummary,
  Paginated,
  Product,
  ProductListQuery,
  PublicUser,
  QuoteOrderInput,
  RegisterInput,
  Store,
  StoreListQuery,
  StoreWithCatalogue,
  UpdateOrderStatusInput,
} from '@samou-go/shared-types';
import type { DeliveryFeeConfig, Locale, OrderStatus, UserRole } from '@samou-go/shared-types';

/* ---------------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------------- */

/** Used when `VITE_API_URL` is unset, which is the normal case in development. */
export const DEFAULT_API_URL = 'http://localhost:4000/api/v1';

/** Resolved once at module load; Vite inlines the env var at build time. */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');

/**
 * Samou' runs on patchy mobile data. Twelve seconds is long enough for a slow
 * 3G round-trip and short enough that a dead server does not freeze a spinner.
 */
const DEFAULT_TIMEOUT_MS = 12_000;

/** `localStorage` key holding the bearer token. */
const TOKEN_STORAGE_KEY = 'samou-go.accessToken';

/* ---------------------------------------------------------------------------
 * Errors
 * ------------------------------------------------------------------------- */

/** Codes this client raises itself; everything else comes from the server. */
export const CLIENT_ERROR_CODES = {
  /** The request never reached the server — offline, DNS, CORS, refused. */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** The server did not answer within `DEFAULT_TIMEOUT_MS`. */
  TIMEOUT: 'TIMEOUT',
  /** The caller aborted deliberately (component unmounted, query changed). */
  ABORTED: 'ABORTED',
  /** A 2xx that was not the `{ success, data }` envelope — a proxy or a bug. */
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
} as const;

/**
 * Every rejection from this module is an `ApiError`. Callers can switch on
 * `code`, show `message` (bilingual, server-authored), and read `details` to
 * highlight individual form fields.
 */
export class ApiError extends Error {
  readonly code: string;
  /** HTTP status, or `0` when the request never got a response. */
  readonly status: number;
  readonly details: ApiFieldError[];

  constructor(code: string, message: string, status = 0, details: ApiFieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** No response at all — worth offering a "retry" rather than an explanation. */
  get isOffline(): boolean {
    return this.code === CLIENT_ERROR_CODES.NETWORK_ERROR || this.code === CLIENT_ERROR_CODES.TIMEOUT;
  }

  /** The caller cancelled; UIs should swallow this rather than render it. */
  get isAborted(): boolean {
    return this.code === CLIENT_ERROR_CODES.ABORTED;
  }

  /** Missing, expired or rejected token — send the user to sign in. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** Field-level validation feedback, keyed by dotted path. */
  fieldError(path: string): string | undefined {
    return this.details.find((detail) => detail.path === path)?.message;
  }
}

/* ---------------------------------------------------------------------------
 * Token storage
 * ------------------------------------------------------------------------- */

/**
 * Kept in `localStorage` so a refresh does not sign the customer out.
 * Wrapped in try/catch because Safari private mode throws on access.
 */
let inMemoryToken: string | null = null;

export function getToken(): string | null {
  if (inMemoryToken !== null) return inMemoryToken;
  try {
    inMemoryToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    inMemoryToken = null;
  }
  return inMemoryToken;
}

export function setToken(token: string | null): void {
  inMemoryToken = token;
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    else window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    /* Private mode — the in-memory copy still carries this session. */
  }
}

export function clearToken(): void {
  setToken(null);
}

/* ---------------------------------------------------------------------------
 * Transport
 * ------------------------------------------------------------------------- */

type QueryValue = string | number | boolean | undefined | null;

interface RequestOptions {
  /** JSON request body. Serialised only when present. */
  body?: unknown;
  /** Query string; `undefined` and `null` entries are dropped. */
  query?: Record<string, QueryValue>;
  /** Attach `Authorization: Bearer …`. Throws early when no token is stored. */
  auth?: boolean;
  /** Caller-owned cancellation, e.g. a React effect cleanup. */
  signal?: AbortSignal;
  timeoutMs?: number;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

/**
 * Combines the caller's signal with a timeout.
 * `AbortSignal.any` would do this in one line but is missing from the older
 * Android WebViews this app has to run on, so it is done by hand.
 */
function withTimeout(
  timeoutMs: number,
  external?: AbortSignal
): { signal: AbortSignal; done: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let expired = false;

  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, timeoutMs);

  const forward = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', forward, { once: true });
  }

  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', forward);
    },
    timedOut: () => expired,
  };
}

/** Reads the body defensively — a proxy error page is HTML, not our envelope. */
async function readEnvelope<T>(response: Response): Promise<ApiResponse<T> | null> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return null;
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, query, auth = false, signal: externalSignal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = getToken();
    if (!token) {
      throw new ApiError('UNAUTHENTICATED', 'يجب تسجيل الدخول أولاً / Please sign in first', 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const timeout = withTimeout(timeoutMs, externalSignal);
  let response: Response;

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      signal: timeout.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    if (timeout.timedOut()) {
      throw new ApiError(
        CLIENT_ERROR_CODES.TIMEOUT,
        'انتهت مهلة الاتصال بالخادم / The server took too long to respond'
      );
    }
    if (externalSignal?.aborted) {
      throw new ApiError(CLIENT_ERROR_CODES.ABORTED, 'تم إلغاء الطلب / Request cancelled');
    }
    throw new ApiError(
      CLIENT_ERROR_CODES.NETWORK_ERROR,
      'تعذّر الاتصال بالخادم، تحقق من الإنترنت / Cannot reach the server',
      0,
      [{ path: '', message: cause instanceof Error ? cause.message : String(cause) }]
    );
  } finally {
    timeout.done();
  }

  const envelope = await readEnvelope<T>(response);

  if (envelope && envelope.success === false) {
    // A rejected token is dead weight; drop it so the UI stops re-sending it.
    if (response.status === 401) clearToken();
    throw new ApiError(
      envelope.error.code,
      envelope.error.message,
      response.status,
      envelope.error.details ?? []
    );
  }

  if (!response.ok) {
    if (response.status === 401) clearToken();
    throw new ApiError(
      `HTTP_${response.status}`,
      `تعذّر تنفيذ الطلب (${response.status}) / Request failed`,
      response.status
    );
  }

  if (!envelope) {
    throw new ApiError(
      CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
      'ردّ غير متوقع من الخادم / Unexpected response from the server',
      response.status
    );
  }

  return envelope.data;
}

/* ---------------------------------------------------------------------------
 * GET /api/v1/meta
 * ------------------------------------------------------------------------- */

/** Shape of `GET /meta` — the live tariff and vocabulary, straight from the server. */
export interface ApiMeta {
  deliveryFee: DeliveryFeeConfig & { label: Record<Locale, string> };
  orderStatuses: OrderStatus[];
  orderStatusLabels: Record<OrderStatus, Record<Locale, string>>;
  userRoleLabels: Record<UserRole, Record<Locale, string>>;
}

/**
 * Reads the delivery tariff the server is actually charging. The rule lives in
 * `@samou-go/shared-types`, but the *amounts* are env-overridable server side —
 * so a screen that quotes a price should ask rather than assume.
 */
export function getMeta(signal?: AbortSignal): Promise<ApiMeta> {
  return request<ApiMeta>('GET', '/meta', { signal });
}

/* ---------------------------------------------------------------------------
 * GET /api/v1/stores — catalogue
 * ------------------------------------------------------------------------- */

/** Paginated store list. Inactive stores are hidden unless `activeOnly: false`. */
export function getStores(query: StoreListQuery = {}, signal?: AbortSignal): Promise<Paginated<Store>> {
  return request<Paginated<Store>>('GET', '/stores', { query: { ...query }, signal });
}

/** One store with its categories and available products inlined. */
export function getStore(storeId: string, signal?: AbortSignal): Promise<StoreWithCatalogue> {
  return request<StoreWithCatalogue>('GET', `/stores/${encodeURIComponent(storeId)}`, { signal });
}

/** Paginated products within a store, filterable by category or search term. */
export function getStoreProducts(
  storeId: string,
  query: ProductListQuery = {},
  signal?: AbortSignal
): Promise<Paginated<Product>> {
  return request<Paginated<Product>>('GET', `/stores/${encodeURIComponent(storeId)}/products`, {
    query: { ...query },
    signal,
  });
}

/* ---------------------------------------------------------------------------
 * POST /api/v1/orders — ordering
 * ------------------------------------------------------------------------- */

/**
 * Prices a basket without writing anything — this is how the cart shows a
 * delivery fee before the customer commits. Public: no token required.
 */
export function quoteOrder(input: QuoteOrderInput, signal?: AbortSignal): Promise<OrderQuote> {
  return request<OrderQuote>('POST', '/orders/quote', { body: input, signal });
}

/**
 * Places the order. Note what `CreateOrderInput` does not contain: `subtotal`,
 * `deliveryFee`, `totalAmount`. The server prices the basket from the products
 * table and derives the fee from the item count. Do not add them here.
 */
export function createOrder(input: CreateOrderInput, signal?: AbortSignal): Promise<OrderDetail> {
  return request<OrderDetail>('POST', '/orders', { body: input, auth: true, signal });
}

/** `GET /orders/:id` — the tracking screen's poll target. Role-scoped server side. */
export function getOrder(orderId: string, signal?: AbortSignal): Promise<OrderDetail> {
  return request<OrderDetail>('GET', `/orders/${encodeURIComponent(orderId)}`, {
    auth: true,
    signal,
  });
}

/** The caller's own orders, scoped by role on the server. */
export function listOrders(
  query: OrderListQuery = {},
  signal?: AbortSignal
): Promise<Paginated<OrderSummary>> {
  return request<Paginated<OrderSummary>>('GET', '/orders', {
    query: { ...query },
    auth: true,
    signal,
  });
}

/**
 * Moves an order along the state machine. The server enforces three gates —
 * legal transition, role, ownership — so a rejection here is expected, not a bug.
 */
export function updateOrderStatus(
  orderId: string,
  input: UpdateOrderStatusInput,
  signal?: AbortSignal
): Promise<OrderDetail> {
  return request<OrderDetail>('PATCH', `/orders/${encodeURIComponent(orderId)}/status`, {
    body: input,
    auth: true,
    signal,
  });
}

/* ---------------------------------------------------------------------------
 * /api/v1/auth
 * ------------------------------------------------------------------------- */

/** Signs in and stores the bearer token for every later call. */
export async function login(input: LoginInput, signal?: AbortSignal): Promise<AuthResponse> {
  const auth = await request<AuthResponse>('POST', '/auth/login', { body: input, signal });
  setToken(auth.accessToken);
  return auth;
}

/** Self-service registration. The server forces `CUSTOMER`; staff roles need an admin. */
export async function register(input: RegisterInput, signal?: AbortSignal): Promise<AuthResponse> {
  const auth = await request<AuthResponse>('POST', '/auth/register', { body: input, signal });
  setToken(auth.accessToken);
  return auth;
}

/** The current profile. `passwordHash` is never part of this. */
export function me(signal?: AbortSignal): Promise<PublicUser> {
  return request<PublicUser>('GET', '/auth/me', { auth: true, signal });
}

/** Stateless server side — the token is dropped locally either way. */
export async function logout(signal?: AbortSignal): Promise<void> {
  try {
    await request<unknown>('POST', '/auth/logout', { signal });
  } finally {
    clearToken();
  }
}

/** Namespaced handle for callers that prefer `api.getStores()` over named imports. */
export const api = {
  getMeta,
  getStores,
  getStore,
  getStoreProducts,
  quoteOrder,
  createOrder,
  getOrder,
  listOrders,
  updateOrderStatus,
  login,
  register,
  me,
  logout,
  getToken,
  setToken,
  clearToken,
} as const;
