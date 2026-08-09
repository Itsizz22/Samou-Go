/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the Samou' Go Express API, version prefix included.
   * Must be configured for local/native development; production uses a same-origin
   * relative `/api/v1` in production builds — see `.env.example`.
   */
  readonly VITE_API_URL?: string;

  /**
   * Mobile (Capacitor) base host, e.g. `http://192.168.1.20:4000` or a
   * production origin. Takes precedence over `VITE_API_URL`; `/api/v1` is
   * appended automatically when not already present.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
