/**
 * @samou-go/ui — Shared UI primitives for Samou' Go front-ends.
 *
 * Import from sub-paths for tree-shaking:
 *   import { cn } from '@samou-go/ui/lib/utils';
 *   import { DeliveryFee } from '@samou-go/ui/components/DeliveryFee';
 *   import { useIsMobile } from '@samou-go/ui/hooks/useIsMobile';
 */

export * from './components';
export * from './hooks';
export * from './lib';
export { playNewOrderChime } from './chime';
export { bootstrapApp, setAppLanguage, setBrandTheme } from './bootstrap';
export type { BootstrapOptions, AppLanguage, BrandTheme } from './bootstrap';