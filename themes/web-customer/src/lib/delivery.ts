/**
 * Samou' Go — delivery-fee module (theme-local entry point).
 *
 * This app's screens import delivery-fee helpers from `@/lib/delivery` for
 * path stability. The canonical implementation lives in
 * `@samou-go/shared-types` (single source of truth), so this module is just a
 * re-export — fee wording/tariff changes are made once, in shared-types, and
 * every theme picks them up automatically.
 */

export * from '@samou-go/shared-types';