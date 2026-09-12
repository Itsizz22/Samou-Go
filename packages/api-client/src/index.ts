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
export * from './flags';
export * from './accountVault';
export * from './useAccounts';
export { AccountSwitcher } from './AccountSwitcher';
export { compressImage } from './compressImage';
export * from './language';
export * from './useApi';
export * from './useAuth';
export * from './useDarkMode';
export * from './DarkModeToggle';
export * from './SignInGate';
export * from './useToast';
export * from './roles';
export * from './realtime';
export * from './sso';

export * from './config/features';

export { SupportDesk } from './SupportDesk';

export * from './PreparationStatus';

export * from './SessionRecovery';

export * from './ConnectionNotice';

export { OrderChangePanel } from './OrderChangePanel';

export { useCaptainTracking } from './useCaptainTracking';

export { PrescriptionImage } from './PrescriptionImage';

export { OrderChat } from './OrderChat';

export { ProductCustomizationEditor } from './ProductCustomizationEditor';

export { StoreCaptainContact } from './StoreCaptainContact';
