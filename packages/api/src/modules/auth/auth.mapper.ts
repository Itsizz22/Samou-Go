import type { User } from '../../lib/prisma-types';
import type { PublicUser } from '@samou-go/shared-types';

/**
 * Strips `passwordHash` and serialises dates. This is the ONLY way a User
 * leaves the API — never `res.json(user)` directly.
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    isVerified: user.isVerified,
    isAvailable: user.isAvailable,
    assignedStoreId: user.assignedStoreId,
    profileImageUrl: user.profileImageUrl,
    latitude: user.latitude,
    longitude: user.longitude,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
