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
  AdminCreateCaptainInput,
  AdminCreateStoreInput,
  AdminCreateStoreResult,
  AdminStats,
  ApiFieldError,
  ApiResponse,
  ApiSuccess,
  AuthResponse,
  CreateOrderInput,
  CreateProductInput,
  FavoriteListResult,
  LoginInput,
  OrderDetail,
  OrderListQuery,
  OrderQuote,
  OrderSummary,
  OtpDispatchResult,
  OtpRequestInput,
  OtpVerifyInput,
  Paginated,
  PresignUploadInput,
  PresignUploadResult,
  FinalizeUploadResult,
  Product,
  ProductListQuery,
  PublicUser,
  QuoteOrderInput,
  RegisterInput,
  RegisterPendingResponse,
  ResetPasswordInput,
  ReorderResult,
  SetAvailabilityInput,
  Store,
  StoreListQuery,
  StoreWithCatalogue,
  UpdateOrderStatusInput,
  UpdateProductInput,
  UpdateProfileInput,
  UpdateStoreInput,
  UploadKind,
  UserListQuery,
  UpdateUserInput,
} from "@samou-go/shared-types";
import type {
  DeliveryFeeConfig,
  Locale,
  OrderStatus,
  UserRole,
} from "@samou-go/shared-types";

/* ---------------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------------- */

/**
 * Dev fallback base host — loopback only. A production build MUST provide
 * `VITE_API_BASE_URL` (or `VITE_API_URL`); in production the fallback resolves
 * to a same-origin relative path (`/api/v1`) so the reverse proxy serving the
 * SPA also routes `/api/*` to the backend. No private LAN address is ever baked
 * into a bundle.
 */
/** Appends `/api/v1` to a base host unless it already carries a version prefix. */
function withVersionPrefix(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return /\/api\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

/**
 * Resolved once at module load; Vite inlines the env var at build time.
 *
 * Precedence, logged on boot so the active choice is never silent:
 *
 *   1. `VITE_API_BASE_URL` — a base host (e.g. `https://api.samougo.app`, an
 *      ngrok tunnel, or a deployed origin). May already include `/api/v1`.
 *   2. `VITE_API_URL` — full API URL verbatim (legacy, unchanged).
 *   3. Production fallback — same-origin relative `/api/v1` (reverse-proxy assumption).
 *   4. Dev fallback — loopback `http://localhost:4000` (the API's default port),
 *      so a missing `.env` degrades to a working local backend instead of a
 *      module-load crash / white screen.
 *
 * The final dev fallback deliberately never throws: a hard module-load error
 * would blank the whole app when a `.env` is missing. It logs a loud warning
 * instead so the misconfiguration is visible but non-fatal.
 */
export const API_URL: string = (() => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (baseUrl) {
    const url = withVersionPrefix(baseUrl);
    console.info(`[api-client] API base URL — VITE_API_BASE_URL: ${url}`);
    return url;
  }

  const legacyUrl = import.meta.env.VITE_API_URL;
  if (legacyUrl) {
    const url = legacyUrl.replace(/\/+$/, "");
    console.info(`[api-client] API base URL — VITE_API_URL: ${url}`);
    return url;
  }

  if (import.meta.env.PROD) {
    // Same-origin reverse proxy: the deployment serves the SPA and proxies
    // `/api/*` to the backend. Operators that run the API on another origin
    // must set VITE_API_BASE_URL at build time.
    const url = "/api/v1";
    console.info(
      "[api-client] API base URL — production build, assuming same-origin reverse proxy: " +
        url,
    );
    return url;
  }

  const url = withVersionPrefix("http://localhost:4000");
  console.warn(
    "[api-client] VITE_API_BASE_URL is not set — defaulting to local dev backend " +
      url +
      ". Create a theme .env (see .env.example) to pin the endpoint.",
  );
  return url;
})();

/** True when `url` points at a free-tier ngrok tunnel host. */
function isNgrokUrl(url: string): boolean {
  try {
    return /(^|\.)ngrok-(free\.)?app$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Samou' runs on patchy mobile data. Twelve seconds is long enough for a slow
 * 3G round-trip and short enough that a dead server does not freeze a spinner.
 */
const DEFAULT_TIMEOUT_MS = 12_000;

/* ---------------------------------------------------------------------------
 * Errors
 * ------------------------------------------------------------------------- */

/** Codes this client raises itself; everything else comes from the server. */
export const CLIENT_ERROR_CODES = {
  /** The request never reached the server — offline, DNS, CORS, refused. */
  NETWORK_ERROR: "NETWORK_ERROR",
  /** The server did not answer within `DEFAULT_TIMEOUT_MS`. */
  TIMEOUT: "TIMEOUT",
  /** The caller aborted deliberately (component unmounted, query changed). */
  ABORTED: "ABORTED",
  /** A 2xx that was not the `{ success, data }` envelope — a proxy or a bug. */
  MALFORMED_RESPONSE: "MALFORMED_RESPONSE",
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

  constructor(
    code: string,
    message: string,
    status = 0,
    details: ApiFieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** No response at all — worth offering a "retry" rather than an explanation. */
  get isOffline(): boolean {
    return (
      this.code === CLIENT_ERROR_CODES.NETWORK_ERROR ||
      this.code === CLIENT_ERROR_CODES.TIMEOUT
    );
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
 * Wrapped in try/catch because Safari private mode throws on access. The
 * in-memory copies keep callers synchronous; the first `getToken()` call pulls
 * persisted tokens into memory.
 */

const TOKEN_STORAGE_KEY = "samou-go.accessToken";
const REFRESH_TOKEN_STORAGE_KEY = "samou-go.refreshToken";
type SessionPersistence = "local" | "session";
let sessionPersistence: SessionPersistence = "local";

let inMemoryToken: string | null = null;
let inMemoryRefreshToken: string | null = null;

/** Best-effort persistence; failures never surface — the in-memory copy rules. */
function persist(key: string, value: string | null): void {
  try {
    const target =
      sessionPersistence === "local" ? localStorage : sessionStorage;
    if (value === null) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } else {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
      target.setItem(key, value);
    }
  } catch {
    /* Private mode — the in-memory copy still carries this session. */
  }
}

export function getToken(): string | null {
  if (inMemoryToken !== null) return inMemoryToken;
  try {
    inMemoryToken =
      localStorage.getItem(TOKEN_STORAGE_KEY) ??
      sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    inMemoryToken = null;
  }
  return inMemoryToken;
}

export function setToken(token: string | null): void {
  inMemoryToken = token;
  persist(TOKEN_STORAGE_KEY, token);
  notifyTokenChange();
}

export function clearToken(): void {
  setToken(null);
}

/**
 * Token lifecycle is app-global (any screen can sign in or out), so a store
 * that caches session-scoped data — favorites, for instance — needs a way to
 * hear about it. Subscribe here and re-read `getToken()` when notified.
 * Returns an unsubscribe function.
 */
export function subscribeTokenChange(listener: () => void): () => void {
  tokenChangeListeners.add(listener);
  return () => {
    tokenChangeListeners.delete(listener);
  };
}

const tokenChangeListeners = new Set<() => void>();

function notifyTokenChange(): void {
  tokenChangeListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* A listener must never take the auth layer down with it. */
    }
  });
}

export function getRefreshToken(): string | null {
  if (inMemoryRefreshToken !== null) return inMemoryRefreshToken;
  try {
    inMemoryRefreshToken =
      localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY) ??
      sessionStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    inMemoryRefreshToken = null;
  }
  return inMemoryRefreshToken;
}

export function setRefreshToken(token: string | null): void {
  inMemoryRefreshToken = token;
  persist(REFRESH_TOKEN_STORAGE_KEY, token);
}

export function clearTokens(): void {
  clearToken();
  setRefreshToken(null);
}

/** Select storage before login/register: local survives browser restarts; session ends on tab close. */
export function setSessionPersistence(remember: boolean): void {
  sessionPersistence = remember ? "local" : "session";
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
  /** Internal: never retry with a refreshed token (used by the refresh call itself). */
  bypassRefreshRetry?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
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
  external?: AbortSignal,
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
    else external.addEventListener("abort", forward, { once: true });
  }

  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", forward);
    },
    timedOut: () => expired,
  };
}

/** Reads the body defensively — a proxy error page is HTML, not our envelope. */
async function readEnvelope<T>(
  response: Response,
): Promise<ApiResponse<T> | null> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return null;
  }
}

/**
 * Single-flight session refresh. When several parallel requests all hit an
 * expired access token at once, exactly one `/auth/refresh` round-trip happens
 * and the rest await the same promise, then retry with the fresh token.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSessionIfPossible(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = getRefreshToken();
    if (!refresh) {
      clearTokens();
      return false;
    }
    try {
      const result = await request<AuthResponse>(
        "POST",
        "/auth/refresh",
        { body: { refreshToken: refresh } },
        true,
      );
      setToken(result.accessToken);
      setRefreshToken(result.refreshToken ?? null);
      return true;
    } catch {
      // Offline or rejected — the session is gone; drop the dead credentials so
      // the UI can show a sign-in gate instead of infinite retries.
      clearTokens();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  options: RequestOptions = {},
  alreadyRefreshed = false,
): Promise<T> {
  const {
    body,
    query,
    auth = false,
    signal: externalSignal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    bypassRefreshRetry = false,
  } = options;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  // Free-tier ngrok serves an interstitial "browser warning" page to requests
  // it does not recognise as a real browser, so while the API is fronted by an
  // ngrok tunnel the client opts out with this header. It is sent ONLY for
  // ngrok hosts: a non-ngrok origin (Vercel→Render, a LAN IP) must not receive
  // a header its CORS policy never sanctioned, or the preflight dies.
  if (isNgrokUrl(API_URL)) headers["ngrok-skip-browser-warning"] = "true";
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const token = getToken();
    if (!token) {
      throw new ApiError(
        "UNAUTHENTICATED",
        "يجب تسجيل الدخول أولاً / Please sign in first",
        401,
      );
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
        "انتهت مهلة الاتصال بالخادم / The server took too long to respond",
      );
    }
    if (externalSignal?.aborted) {
      throw new ApiError(
        CLIENT_ERROR_CODES.ABORTED,
        "تم إلغاء الطلب / Request cancelled",
      );
    }
    throw new ApiError(
      CLIENT_ERROR_CODES.NETWORK_ERROR,
      "تعذّر الاتصال بالخادم، تحقق من الإنترنت / Cannot reach the server",
      0,
      [
        {
          path: "",
          message: cause instanceof Error ? cause.message : String(cause),
        },
      ],
    );
  } finally {
    timeout.done();
  }

  const envelope = await readEnvelope<T>(response);

  if (envelope && envelope.success === false) {
    // An expired access token triggers ONE silent refresh, then a retry. A
    // second 401 (or a failed refresh) means the session is genuinely dead.
    if (
      response.status === 401 &&
      auth &&
      !alreadyRefreshed &&
      !bypassRefreshRetry
    ) {
      if (await refreshSessionIfPossible()) {
        return request<T>(method, path, options, true);
      }
    }
    if (response.status === 401) clearToken();
    throw new ApiError(
      envelope.error.code,
      envelope.error.message,
      response.status,
      envelope.error.details ?? [],
    );
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      auth &&
      !alreadyRefreshed &&
      !bypassRefreshRetry
    ) {
      if (await refreshSessionIfPossible()) {
        return request<T>(method, path, options, true);
      }
    }
    if (response.status === 401) clearToken();
    throw new ApiError(
      `HTTP_${response.status}`,
      `تعذّر تنفيذ الطلب (${response.status}) / Request failed`,
      response.status,
    );
  }

  if (!envelope) {
    // A 2xx with an empty body (e.g. HTTP 204 No Content from
    // `DELETE /uploads/raw/:key`) is a valid success that carries no data.
    // Return `undefined` instead of treating it as a malformed response.
    return undefined as T;
  }

  // By this point every ApiFailure case has already thrown above, so the only
  // shape `envelope` can still be is ApiSuccess<T>. TypeScript's control-flow
  // narrowing doesn't carry across the unrelated `!response.ok` check in
  // between, so we assert explicitly rather than fight the inference.
  return (envelope as ApiSuccess<T>).data;
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
  return request<ApiMeta>("GET", "/meta", { signal });
}

/* ---------------------------------------------------------------------------
 * GET /api/v1/stores — catalogue
 * ------------------------------------------------------------------------- */

/** Paginated store list. Inactive stores are hidden unless `activeOnly: false`. */
export function getStores(
  query: StoreListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<Store>> {
  return request<Paginated<Store>>("GET", "/stores", {
    query: { ...query },
    signal,
  });
}

/** One store with its categories and available products inlined. */
export function getStore(
  storeId: string,
  signal?: AbortSignal,
): Promise<StoreWithCatalogue> {
  return request<StoreWithCatalogue>(
    "GET",
    `/stores/${encodeURIComponent(storeId)}`,
    { signal },
  );
}

/**
 * Full catalogue for the store manager — includes unavailable products so the
 * manager can re-enable them. Requires STORE_MANAGER (own store) or ADMIN.
 */
export function getStoreManager(
  storeId: string,
  signal?: AbortSignal,
): Promise<StoreWithCatalogue> {
  return request<StoreWithCatalogue>(
    "GET",
    `/stores/${encodeURIComponent(storeId)}/full`,
    {
      auth: true,
      signal,
    },
  );
}

/** Paginated products within a store, filterable by category or search term. */
export function getStoreProducts(
  storeId: string,
  query: ProductListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<Product>> {
  return request<Paginated<Product>>(
    "GET",
    `/stores/${encodeURIComponent(storeId)}/products`,
    {
      query: { ...query },
      signal,
    },
  );
}

/* ---------------------------------------------------------------------------
 * POST /api/v1/orders — ordering
 * ------------------------------------------------------------------------- */

/**
 * Prices a basket without writing anything — this is how the cart shows a
 * delivery fee before the customer commits. Public: no token required.
 */
export function quoteOrder(
  input: QuoteOrderInput,
  signal?: AbortSignal,
): Promise<OrderQuote> {
  return request<OrderQuote>("POST", "/orders/quote", { body: input, signal });
}

/**
 * Places the order. Note what `CreateOrderInput` does not contain: `subtotal`,
 * `deliveryFee`, `totalAmount`. The server prices the basket from the products
 * table and derives the fee from the item count. Do not add them here.
 */
export function createOrder(
  input: CreateOrderInput,
  signal?: AbortSignal,
): Promise<OrderDetail> {
  return request<OrderDetail>("POST", "/orders", {
    body: input,
    auth: true,
    signal,
  });
}

/** `GET /orders/:id` — the tracking screen's poll target. Role-scoped server side. */
export function getOrder(
  orderId: string,
  signal?: AbortSignal,
): Promise<OrderDetail> {
  return request<OrderDetail>("GET", `/orders/${encodeURIComponent(orderId)}`, {
    auth: true,
    signal,
  });
}

/** The caller's own orders, scoped by role on the server. */
export function listOrders(
  query: OrderListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<OrderSummary>> {
  return request<Paginated<OrderSummary>>("GET", "/orders", {
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
  signal?: AbortSignal,
): Promise<OrderDetail> {
  return request<OrderDetail>(
    "PATCH",
    `/orders/${encodeURIComponent(orderId)}/status`,
    {
      body: input,
      auth: true,
      signal,
    },
  );
}

/**
 * Re-order — clones a past order's basket using CURRENT product prices, so the
 * customer can load it straight into the cart. Requires the same visibility the
 * order itself does (owner, or admin).
 */
export function reorderOrder(
  orderId: string,
  signal?: AbortSignal,
): Promise<ReorderResult> {
  return request<ReorderResult>(
    "POST",
    `/orders/${encodeURIComponent(orderId)}/reorder`,
    {
      auth: true,
      signal,
    },
  );
}

/* ---------------------------------------------------------------------------
 * /api/v1/favorites — the signed-in customer's favourite stores
 * ------------------------------------------------------------------------- */

/** The customer's favorited stores, newest first. */
export function getFavorites(
  signal?: AbortSignal,
): Promise<FavoriteListResult> {
  return request<FavoriteListResult>("GET", "/favorites", {
    auth: true,
    signal,
  });
}

/** Idempotently adds a store to the customer's favorites. */
export function addFavorite(
  storeId: string,
  signal?: AbortSignal,
): Promise<{ favorited: true }> {
  return request<{ favorited: true }>(
    "PUT",
    `/favorites/${encodeURIComponent(storeId)}`,
    {
      auth: true,
      signal,
    },
  );
}

/** Idempotently removes a store from the customer's favorites. */
export function removeFavorite(
  storeId: string,
  signal?: AbortSignal,
): Promise<{ favorited: false }> {
  return request<{ favorited: false }>(
    "DELETE",
    `/favorites/${encodeURIComponent(storeId)}`,
    {
      auth: true,
      signal,
    },
  );
}

/* ---------------------------------------------------------------------------
 * /api/v1/auth
 * ------------------------------------------------------------------------- */

/** Signs in and stores the bearer + refresh tokens for every later call. */
export async function login(
  input: LoginInput,
  signal?: AbortSignal,
): Promise<AuthResponse> {
  const auth = await request<AuthResponse>("POST", "/auth/login", {
    body: input,
    signal,
  });
  setToken(auth.accessToken);
  setRefreshToken(auth.refreshToken ?? null);
  return auth;
}

/**
 * Self-service registration. The server forces `CUSTOMER`; staff roles need an
 * admin. Registration never returns a session — it creates the account and
 * dispatches a one-time code, so the caller must complete `/auth/otp/verify`
 * before any token exists.
 */
export async function register(
  input: RegisterInput,
  signal?: AbortSignal,
): Promise<RegisterPendingResponse> {
  return request<RegisterPendingResponse>("POST", "/auth/register", {
    body: input,
    signal,
  });
}

/** Replaces a forgotten password after the customer proves phone ownership with an OTP. */
export function resetPassword(
  input: ResetPasswordInput,
  signal?: AbortSignal,
): Promise<void> {
  return request<unknown>("POST", "/auth/password/reset", {
    body: input,
    signal,
  }).then(() => undefined);
}

/**
 * Requests a one-time code. The server rate-limits a phone to 3 per 5 minutes
 * and answers overflow with a 429 whose `Retry-After` the UI can read.
 */
export function requestOtp(
  input: OtpRequestInput,
  signal?: AbortSignal,
): Promise<OtpDispatchResult> {
  return request<OtpDispatchResult>("POST", "/auth/otp/request", { body: input, signal });
}

/**
 * Exchanges a code for a session and stores both tokens. A brand-new phone
 * auto-provisions a CUSTOMER account server-side.
 */
export async function verifyOtp(
  input: OtpVerifyInput,
  signal?: AbortSignal,
): Promise<AuthResponse> {
  const auth = await request<AuthResponse>("POST", "/auth/otp/verify", {
    body: input,
    signal,
  });
  setToken(auth.accessToken);
  setRefreshToken(auth.refreshToken ?? null);
  return auth;
}

/**
 * Explicit refresh — used by session restore at boot. The request layer also
 * refreshes silently on 401, so callers rarely need this directly.
 */
export async function refreshAccessToken(
  refreshToken: string,
  signal?: AbortSignal,
): Promise<AuthResponse> {
  const auth = await request<AuthResponse>("POST", "/auth/refresh", {
    body: { refreshToken },
    signal,
  });
  setToken(auth.accessToken);
  setRefreshToken(auth.refreshToken ?? null);
  return auth;
}

/** The current profile. `passwordHash` is never part of this. */
export function me(signal?: AbortSignal): Promise<PublicUser> {
  return request<PublicUser>("GET", "/auth/me", { auth: true, signal });
}

/** Stateless access tokens are dropped locally; the refresh token is revoked server-side. */
export async function logout(signal?: AbortSignal): Promise<void> {
  try {
    const refresh = getRefreshToken();
    if (refresh) {
      await request<unknown>("POST", "/auth/logout", {
        body: { refreshToken: refresh },
        signal,
      });
    } else {
      await request<unknown>("POST", "/auth/logout", { signal });
    }
  } finally {
    clearTokens();
  }
}

/** Updates the signed-in user's own profile (name, phone, password). */
export function updateProfile(
  input: UpdateProfileInput,
  signal?: AbortSignal,
): Promise<PublicUser> {
  return request<PublicUser>("PATCH", "/auth/me", {
    body: input,
    auth: true,
    signal,
  });
}

/** Captains flip their own online/offline state. Rejected for non-captains. */
export function setAvailability(
  input: SetAvailabilityInput,
  signal?: AbortSignal,
): Promise<PublicUser> {
  return request<PublicUser>("PATCH", "/auth/me/availability", {
    body: input,
    auth: true,
    signal,
  });
}

/* ---------------------------------------------------------------------------
 * /api/v1/uploads — image upload pipeline
 * ------------------------------------------------------------------------- */

/**
 * POST /uploads/presign — asks the server for a PUT target for raw bytes.
 * The returned `key` must be handed back to `finalizeUpload` unchanged.
 */
export function presignUpload(
  input: PresignUploadInput,
  signal?: AbortSignal,
): Promise<PresignUploadResult> {
  return request<PresignUploadResult>("POST", "/uploads/presign", {
    body: input,
    auth: true,
    signal,
  });
}

/**
 * PUT /uploads/raw/:key — streams a File into the server's raw storage.
 * Image bytes, not JSON; the raw content type is sent so a future S3 driver
 * can pick it up. One silent 401-refresh retry, like the JSON transport.
 */
export async function uploadRawFile(
  key: string,
  file: Blob,
  signal?: AbortSignal,
): Promise<void> {
  const putOnce = async (): Promise<Response> => {
    const token = getToken();
    if (!token) {
      throw new ApiError(
        "UNAUTHENTICATED",
        "يجب تسجيل الدخول أولاً / Please sign in first",
        401,
      );
    }
    return fetch(`${API_URL}/uploads/raw/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
      signal,
    });
  };

  let response = await putOnce();

  if (
    response.status === 401 &&
    getRefreshToken() &&
    (await refreshSessionIfPossible())
  ) {
    response = await putOnce();
  }

  if (!response.ok) {
    const envelope = await readEnvelope<never>(response);
    if (envelope && envelope.success === false) {
      throw new ApiError(
        envelope.error.code,
        envelope.error.message,
        response.status,
        envelope.error.details ?? [],
      );
    }
    throw new ApiError(
      `HTTP_${response.status}`,
      `تعذّر رفع الصورة (${response.status}) / Image upload failed`,
      response.status,
    );
  }
}

/**
 * POST /uploads/finalize — tells the server the raw bytes are in; it validates,
 * processes and attaches the image. Returns the public, cacheable URL.
 */
export function finalizeUpload(
  key: string,
  kind: UploadKind,
  signal?: AbortSignal,
): Promise<FinalizeUploadResult> {
  return request<FinalizeUploadResult>("POST", "/uploads/finalize", {
    body: { key, kind },
    auth: true,
    signal,
  });
}

/**
 * DELETE /uploads/current — removes the image currently attached to the
 * caller's avatar (`kind: 'user'`) or to a managed product (`kind: 'product'`
 * with `resourceId`). No opaque key needed: the server resolves it from the
 * profile/product record.
 */
export async function removeCurrentImage(
  kind: UploadKind,
  resourceId?: string,
  signal?: AbortSignal,
): Promise<void> {
  await request<unknown>("DELETE", "/uploads/current", {
    body: { kind, resourceId },
    auth: true,
    signal,
  });
}

/**
 * Presign → PUT bytes → finalize in one call. This is what a screen calls when
 * the user picks a file; the three-step path is only needed for uploads that
 * outlive the current request (offline queues, background workers). The
 * `contentType` is taken from the file; the server still rejects anything that
 * is not JPEG/PNG/WebP.
 */
export async function uploadImage(
  input: { kind: UploadKind; resourceId?: string; contentType?: string },
  file: Blob,
  signal?: AbortSignal,
): Promise<FinalizeUploadResult> {
  const prepared = await presignUpload(
    {
      kind: input.kind,
      resourceId: input.resourceId,
      contentType: input.contentType ?? (file.type || "application/octet-stream"),
    },
    signal,
  );
  await uploadRawFile(prepared.key, file, signal);
  return finalizeUpload(prepared.key, input.kind, signal);
}

/* ---------------------------------------------------------------------------
 * /api/v1/stores — write operations (STORE_MANAGER / ADMIN)
 * ------------------------------------------------------------------------- */

/** Updates a store's name, phone, logo, or active status. */
export function updateStore(
  storeId: string,
  input: UpdateStoreInput,
  signal?: AbortSignal,
): Promise<Store> {
  return request<Store>("PATCH", `/stores/${encodeURIComponent(storeId)}`, {
    body: input,
    auth: true,
    signal,
  });
}

/** Creates a new product inside a store. */
export function createProduct(
  storeId: string,
  input: CreateProductInput,
  signal?: AbortSignal,
): Promise<Product> {
  return request<Product>(
    "POST",
    `/stores/${encodeURIComponent(storeId)}/products`,
    {
      body: input,
      auth: true,
      signal,
    },
  );
}

/** Updates an existing product (price, availability, name, …). */
export function updateProduct(
  storeId: string,
  productId: string,
  input: UpdateProductInput,
  signal?: AbortSignal,
): Promise<Product> {
  return request<Product>(
    "PATCH",
    `/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}`,
    { body: input, auth: true, signal },
  );
}

/**
 * Soft-deactivates a product (sets isAvailable = false).
 * Hard delete is intentionally unsupported — products with order history cannot
 * be removed without breaking the audit trail.
 */
export function deleteProduct(
  storeId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<Product> {
  return request<Product>(
    "DELETE",
    `/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}`,
    { auth: true, signal },
  );
}

/* ---------------------------------------------------------------------------
 * /api/v1/users — admin user management
 * ------------------------------------------------------------------------- */

/** Returns a paginated list of all users. Requires ADMIN. */
export function listUsers(
  query: UserListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<PublicUser>> {
  return request<Paginated<PublicUser>>("GET", "/users", {
    query: { ...query },
    auth: true,
    signal,
  });
}

/** Activates/deactivates a user or changes their role. Requires ADMIN. */
export function updateUser(
  userId: string,
  input: UpdateUserInput,
  signal?: AbortSignal,
): Promise<PublicUser> {
  return request<PublicUser>("PATCH", `/users/${encodeURIComponent(userId)}`, {
    body: input,
    auth: true,
    signal,
  });
}

/* ---------------------------------------------------------------------------
 * /api/v1/admin — admin dashboard aggregates
 * ------------------------------------------------------------------------- */

/**
 * One round-trip with every number the admin dashboard renders: revenue,
 * order counts by status, captain/store/user summaries, and the five most
 * recent orders. Requires ADMIN.
 */
export function getAdminStats(signal?: AbortSignal): Promise<AdminStats> {
  return request<AdminStats>("GET", "/admin/stats", { auth: true, signal });
}

/** POST /admin/stores — admin creates a store plus its manager account. */
export function createStore(
  input: AdminCreateStoreInput,
  signal?: AbortSignal,
): Promise<AdminCreateStoreResult> {
  return request<AdminCreateStoreResult>("POST", "/admin/stores", {
    body: input,
    auth: true,
    signal,
  });
}

/** POST /admin/captains — admin creates a new delivery captain. */
export function createCaptain(
  input: AdminCreateCaptainInput,
  signal?: AbortSignal,
): Promise<PublicUser> {
  return request<PublicUser>("POST", "/admin/captains", {
    body: input,
    auth: true,
    signal,
  });
}

/* ---------------------------------------------------------------------------
 * /api/v1/stores — approval
 * ------------------------------------------------------------------------- */

/** Publishes a store to the public catalogue. Requires ADMIN. */
export function approveStore(
  storeId: string,
  signal?: AbortSignal,
): Promise<Store> {
  return request<Store>(
    "PATCH",
    `/stores/${encodeURIComponent(storeId)}/approve`,
    {
      auth: true,
      signal,
    },
  );
}

/* ---------------------------------------------------------------------------
 * /api/v1/captains — verification
 * ------------------------------------------------------------------------- */

/** Confirms a CAPTAIN account so it may take jobs. Requires ADMIN. */
export function verifyCaptain(
  captainId: string,
  signal?: AbortSignal,
): Promise<PublicUser> {
  return request<PublicUser>(
    "PATCH",
    `/captains/${encodeURIComponent(captainId)}/verify`,
    {
      auth: true,
      signal,
    },
  );
}
