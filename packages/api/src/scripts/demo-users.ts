/**
 * Single source of truth for the seed accounts used by `db:seed`.
 */
import { UserRole } from '@samou-go/shared-types';

/** Admin password. */
export const ADMIN_PASSWORD = '22/07Itsizz';

export interface SeedUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  isActive?: boolean;
  isVerified?: boolean;
  isAvailable?: boolean;
}

export const SEED_USERS: SeedUser[] = [
  { id: 'user-admin', name: 'مدير النظام', phone: '0566010623', role: UserRole.ADMIN },
];
