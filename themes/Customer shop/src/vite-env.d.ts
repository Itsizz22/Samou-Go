/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the Samou' Go Express API, version prefix included.
   * Falls back to `http://localhost:4000/api/v1` when unset — see `.env.example`.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
