/**
 * The data-fetching hooks now live in `@samou-go/api-client` so all apps
 * share them. This module stays as the app-local entry point (`@/hooks/useApi`)
 * that every screen here already imports.
 */

export * from '@samou-go/api-client';
