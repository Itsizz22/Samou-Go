/**
 * The data-fetching hooks now live in `@samou-go/api-client` so the checkout
 * and order-tracking apps can share them. This module stays as the app-local
 * entry point (`@/hooks/useApi`) that every screen here already imports.
 *
 * CRITICAL: We re-export a context-aware `useAuth` that reads from
 * `AuthContext` (provided by the root `<AuthProvider>` in App.tsx).
 * This ensures every component in the tree shares a SINGLE auth instance.
 *
 * Without this, each screen calling the original `useAuth()` would create
 * its own independent auth state — causing login to set `user` on the
 * screen's instance while `App` still sees `user: null`, triggering an
 * infinite redirect loop (the "Throttling navigation" blank-screen bug).
 */

export * from '@samou-go/api-client';

// Re-export the original standalone hook under a different name so App.tsx
// can call it to CREATE the shared auth instance.
export { useAuth as useStandaloneAuth } from '@samou-go/api-client';
export type { Auth } from '@samou-go/api-client';

// Re-export the context-aware hook as `useAuth` — this is what every screen
// should call. It reads from the AuthContext provided by App.tsx.
export { useSharedAuth as useAuth } from '@/contexts/AuthContext';
