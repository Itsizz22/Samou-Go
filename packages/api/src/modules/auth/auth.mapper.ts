import type { User } from '@prisma/client';
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
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
