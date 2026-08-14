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
  AuthResponse,
  CreateOrderInput,
  CreateProductInput,
  FavoriteListResult,
  LoginInput,
  OrderDetail,
  OrderListQuery,
  OrderQuote,
  OrderSummary,
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

/** Appends `/api/v1` to a base host unless it already carries a version prefix. */
function withVersionPrefix(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return /\/api\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

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

const DEFAULT_TIMEOUT_MS = 12_000;

/* ---------------------------------------------------------------------------
 * Errors
 * ------------------------------------------------------------------------- */

export const CLIENT_ERROR_CODES = {
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  ABORTED: "ABORTED",
  MALFORMED_RESPONSE: "MALFORMED_RESPONSE",
} as const;

export class ApiError extends Error {
  readonly code: string;
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

  get isOffline(): boolean {
    return (
      this.code === CLIENT_ERROR_CODES.NETWORK_ERROR ||
      this.code === CLIENT_ERROR_CODES.TIMEOUT
    );
  }

  get isAborted(): boolean {
    return this.code === CLIENT_ERROR_CODES.ABORTED;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  fieldError(path: string): string | undefined {
    return this.details.find((detail) => detail.path === path)?.message;
  }
}

/* ---------------------------------------------------------------------------
 * Token storage
 * ------------------------------------------------------------------------- */

const TOKEN_STORAGE_KEY = "samou-go.accessToken";
const REFRESH_TOKEN_STORAGE_KEY = "samou-go.refreshToken";
type SessionPersistence = "local" | "session";
let sessionPersistence: SessionPersistence = "local";

let inMemoryToken: string | null = null;
let inMemoryRefreshToken: string | null = null;

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
    /* Private mode */
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
      /* Protection */
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

export function setSessionPersistence(remember: boolean): void {
  sessionPersistence = remember ? "local" : "session";
}

/* ---------------------------------------------------------------------------
 * Transport
 * ------------------------------------------------------------------------- */

type QueryValue = string | number | boolean | undefined | null;

interface RequestOptions {
  body?: unknown;
  query?: Record<string, QueryValue>;
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
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
    "ngrok-skip-browser-warning": "true",
  };
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
    return undefined as T;
  }

  // ✅ التعديل الجوهري: تأكيد الـ Type Guard لـ TypeScript
  if (envelope.success) {
    return envelope.data;
  }

  throw new ApiError(
    CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
    "استجابة غير متوقعة من الخادم / Malformed response",
    response.status,
  );
}

/* ---------------------------------------------------------------------------
 * GET /api/v1/meta
 * ------------------------------------------------------------------------- */

export interface ApiMeta {
  deliveryFee: DeliveryFeeConfig & { label: Record<Locale, string> };
  orderStatuses: OrderStatus[];
  orderStatusLabels: Record<OrderStatus, Record<Locale, string>>;
  userRoleLabels: Record<UserRole, Record<Locale, string>>;
}

export function getMeta(signal?: AbortSignal): Promise<ApiMeta> {
  return request<ApiMeta>("GET", "/meta", { signal });
}

/* ---------------------------------------------------------------------------
 * GET /api/v1/stores — catalogue
 * ------------------------------------------------------------------------- */

export function getStores(
  query: StoreListQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<Store>> {
  return request<Paginated<Store>>("GET", "/stores", {
    query: { ...query },
    signal,
  });
}

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

export function quoteOrder(
  input: QuoteOrderInput,
  signal?: AbortSignal,
): Promise<OrderQuote> {
  return request<OrderQuote>("POST", "/orders/quote", { body: input, signal });
}

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

export function getOrder(
  orderId: string,
  signal?: AbortSignal,
): Promise<OrderDetail> {
  return request<OrderDetail>("GET", `/orders/${encodeURIComponent(orderId)}`, {
    auth: true,
    signal,
  });
}

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

export function getFavorites(
  signal?: AbortSignal,
): Promise<FavoriteListResult> {
  return request<FavoriteListResult>("GET", "/favorites", {
    auth: true,
    signal,
  });
}

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

export async function register(
  input: RegisterInput,
  signal?: AbortSignal,
): Promise<AuthResponse> {
  const auth = await request<AuthResponse>("POST", "/auth/register", {
    body: input,
    signal,
  });
  setToken(auth.accessToken);
  setRefreshToken(auth.refreshToken ?? null);
  return auth;
}

export function resetPassword(
  input: ResetPasswordInput,
  signal?: AbortSignal,
): Promise<void> {
  return request<unknown>("POST", "/auth/password/reset", {
    body: input,
    signal,
  }).then(() => undefined);
}

export function requestOtp(
  input: OtpRequestInput,
  signal?: AbortSignal,
): Promise<{
  retryAfterSeconds: number;
  dispatched: boolean;
}> {
  return request("POST", "/auth/otp/request", { body: input, signal });
}

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

export function me(signal?: AbortSignal): Promise<PublicUser> {
  return request<PublicUser>("GET", "/auth/me", { auth: true, signal });
}

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

export function updateProduct(
  storeId: string,
  productId: string,
  input: UpdateProductInput,
  signal?: AbortSignal,
): Promise<Product> {
  return request<Product>(
    "PATCH",
    `/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(
      productId,
    )}`,
    {
      body: input,
      auth: true,
      signal,
    },
  );
}

export function deleteProduct(
  storeId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<void> {
  return request<unknown>(
    "DELETE",
    `/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(
      productId,
    )}`,
    {
      auth: true,
      signal,
    },
  ).then(() => undefined);
}