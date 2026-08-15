/**
 * Single source of truth for the demo accounts used by `db:seed` and
 * `db:demo-passwords`. Keeping the list here (and the password constant) means
 * a re-hash can never drift from what the seed creates.
 */
import { UserRole } from '@samou-go/shared-types';

/** Public-knowledge demo password for every seeded account. */
export const DEMO_PASSWORD = 'samou1234';

export interface DemoUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  isActive?: boolean;
  isVerified?: boolean;
  isAvailable?: boolean;
}

export const DEMO_USERS: DemoUser[] = [
  { id: 'user-admin', name: 'مدير النظام', phone: '0599000000', role: UserRole.ADMIN },
  { id: 'user-manager-baraka', name: 'محمود أبو عرام', phone: '0599100201', role: UserRole.STORE_MANAGER },
  { id: 'user-manager-shawarma', name: 'صالح المحاريق', phone: '0567100302', role: UserRole.STORE_MANAGER },
  { id: 'user-manager-pharmacy', name: 'رنا الهمص', phone: '0599100403', role: UserRole.STORE_MANAGER },
  { id: 'user-captain-1', name: 'أنس الدغامين', phone: '0599200101', role: UserRole.CAPTAIN, isVerified: true, isAvailable: true },
  { id: 'user-captain-2', name: 'يوسف أبو قبيطة', phone: '0567200102', role: UserRole.CAPTAIN, isVerified: true, isAvailable: true },
  { id: 'user-captain-3', name: 'كريم الشرحة', phone: '0599200103', role: UserRole.CAPTAIN, isActive: false },
  { id: 'user-customer-1', name: 'أحمد الشرحة', phone: '0599300101', role: UserRole.CUSTOMER },
  { id: 'user-customer-2', name: 'سُهى العواودة', phone: '0567300102', role: UserRole.CUSTOMER },
];