/**
 * The API client now lives in `@samou-go/api-client` so the checkout and
 * order-tracking apps can share it. This module stays as the app-local entry
 * point (`@/services/api`) that every screen here already imports.
 */

export * from '@samou-go/api-client';
