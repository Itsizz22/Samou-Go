import { captainStoreIds } from './captain-stores';
import type { User } from '../../lib/prisma-types';
import type { PublicUser } from '@samou-go/shared-types';

/**
 * Strips `passwordHash` and serialises dates. This is the ONLY way a User
 * leaves the API — never `res.json(user)` directly.
 */
export function toPublicUser(user: User & { assignedStores?: { id: string }[]; blockedStores?: { id: string }[] }): PublicUser {
  return {
    id: user.id,
    publicCode: user.publicCode ?? null,
    name: user.name,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    isVerified: user.isVerified,
    isAvailable: user.isAvailable,
    assignedStoreIds: captainStoreIds(user),
    blockedStoreIds: user.blockedStores?.map(store => store.id) ?? [],
    assignedStoreId: user.assignedStoreId,
    profileImageUrl: user.profileImageUrl,
    latitude: user.latitude,
    longitude: user.longitude,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
