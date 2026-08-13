/**
 * Samou' Go — front-end API client.
 *
 * `import { useOrder, quoteOrder, ApiError } from '@samou-go/api-client';`
 *
 * Browser-only by design: this package reads `import.meta.env` and
 * `localStorage` and ships React hooks, so it publishes raw TypeScript source
 * rather than a build. `packages/api` must never import it.
 */

export * from './api';
export * from './useApi';
export * from './useAuth';
export * from './useDarkMode';
export * from './DarkModeToggle';
export * from './SignInGate';
export * from './useToast';
export * from './roles';
export * from './realtime';
