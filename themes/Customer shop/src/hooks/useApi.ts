/**
 * The data-fetching hooks now live in `@samou-go/api-client` so the checkout
 * and order-tracking apps can share them. This module stays as the app-local
 * entry point (`@/hooks/useApi`) that every screen here already imports.
 */

export * from '@samou-go/api-client';
