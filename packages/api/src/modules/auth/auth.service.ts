import { randomInt } from 'node:crypto';
import type { Store, User } from '../../lib/prisma-types';
import type { Prisma } from '../../lib/prisma-types';
import type {
  AuthResponse,
  Paginated,
  PublicUser,
} from '@samou-go/shared-types';
import { UserRole } from '@samou-go/shared-types';
import { prisma, caseInsensitiveContains } from '../../lib/prisma';
import { conflict, forbidden, notFound, unauthorized, unprocessable } from '../../lib/http-error';
import { signAccessToken } from '../../lib/jwt';
import { hashPassword, verifyPassword } from '../../lib/password';
import { fromE164, toE164 } from '../../lib/sms/phone';
import { toPublicUser } from './auth.mapper';
import { verifyAndConsumeOtp } from './otp.service';
import { issueRefreshToken, revokeAllUserRefreshTokens, rotateRefreshToken } from './refresh-token';
import type {
  AdminCreateCaptainBody,
  AdminCreateStoreBody,
  AdminUpdateUserBody,
  LoginBody,
  RefreshTokenBody,
  RegisterBody,
  SetAvailabilityBody,
  UpdateProfileBody,
  UserListQuery,
} from './auth.schemas';

/** Roles a caller may create without being an admin. */
const SELF_SERVICE_ROLES: readonly UserRole[] = [UserRole.CUSTOMER];

/** Composes the login response: access token + a fresh refresh token. */
async function buildAuthResponse(user: User): Promise<AuthResponse> {
  const { accessToken, expiresIn } = signAccessToken({
    userId: user.id,
    role: user.role,
    phone: user.phone,
  });
  const refreshToken = await issueRefreshToken(user.id);
  return { user: toPublicUser(user), accessToken, expiresIn, refreshToken };
}

export async function register(
  body: RegisterBody,
  callerRole?: UserRole
): Promise<AuthResponse> {
  const requestedRole = body.role ?? UserRole.CUSTOMER;

  // Only an admin may mint a STORE_MANAGER, CAPTAIN or another ADMIN.
  if (!SELF_SERVICE_ROLES.includes(requestedRole) && callerRole !== UserRole.ADMIN) {
    throw forbidden(
      'إنشاء هذا النوع من الحسابات يتطلّب صلاحية مشرف / Creating this role requires an admin'
    );
  }

  const existing = await prisma.user.findUnique({ where: { phone: body.phone } });
  if (existing) {
    throw conflict('رقم الجوال مسجّل مسبقاً / This phone number is already registered');
  }

  // Registration is password-based — no OTP step. Create the account,
  // mark it verified, and issue tokens immediately so the user can
  // enter the app without an extra verification wall.
  const user = await prisma.user.create({
    data: {
      name: body.name,
      phone: body.phone,
      passwordHash: await hashPassword(body.password),
      role: requestedRole,
      isVerified: true,
    },
  });

  return buildAuthResponse(user);
}

export async function login(body: LoginBody): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({ where: { phone: body.phone } });

  // Same message for "no such phone" and "wrong password" — do not confirm
  // which phone numbers are registered.
  const invalid = unauthorized('رقم الجوال أو كلمة المرور غير صحيحة / Invalid phone or password');

  if (!user) throw invalid;
  if (!(await verifyPassword(body.password, user.passwordHash))) throw invalid;

  if (!user.isActive) {
    throw forbidden('الحساب موقوف / This account has been deactivated');
  }

  return buildAuthResponse(user);
}

/** POST /auth/refresh — swap a refresh token for a fresh session pair. */
export async function refreshSession(body: RefreshTokenBody): Promise<AuthResponse> {
  const { raw: nextRefreshToken, userId } = await rotateRefreshToken(body.refreshToken);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('الحساب غير موجود / Account no longer exists');
  if (!user.isActive) {
    throw forbidden('الحساب موقوف / This account has been deactivated');
  }

  const { accessToken, expiresIn } = signAccessToken({
    userId: user.id,
    role: user.role,
    phone: user.phone,
  });

  return { user: toPublicUser(user), accessToken, expiresIn, refreshToken: nextRefreshToken };
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('الحساب غير موجود / Account no longer exists');
  return toPublicUser(user);
}

/* ---------------------------------------------------------------------------
 * PATCH /auth/me — caller updates their own profile
 * ------------------------------------------------------------------------- */

export async function updateProfile(
  userId: string,
  body: UpdateProfileBody
): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('الحساب غير موجود / Account no longer exists');

  // Password change requires the current password to be verified first.
  if (body.newPassword) {
    if (!body.currentPassword) {
      throw unprocessable(
        'CURRENT_PASSWORD_REQUIRED',
        'كلمة المرور الحالية مطلوبة لتغيير كلمة المرور / currentPassword is required to set a new password'
      );
    }
    const matches = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!matches) {
      throw unprocessable(
        'WRONG_PASSWORD',
        'كلمة المرور الحالية غير صحيحة / Current password is incorrect'
      );
    }
  }

  // Phone uniqueness check — only if changing phone.
  if (body.phone && body.phone !== user.phone) {
    const conflict_ = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (conflict_) {
      throw conflict('رقم الجوال مسجّل مسبقاً / This phone number is already in use');
    }
    // A phone change must be proven by the OTP dispatched to the NEW number.
    // The schema already requires `otpCode` when `phone` is present; this
    // verifies the code against the stored hash and consumes it so it cannot
    // be replayed against another account.
    await verifyAndConsumeOtp(body.phone, body.otpCode ?? '');
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.newPassword ? { passwordHash: await hashPassword(body.newPassword) } : {}),
    },
  });

  // A password change invalidates every outstanding session — including the
  // one the caller is on, so the client re-authenticates with fresh tokens.
  if (body.newPassword) {
    await revokeAllUserRefreshTokens(userId);
  }

  return toPublicUser(updated);
}

/* ---------------------------------------------------------------------------
 * PUT /users/me/location — the caller persists their own GPS point
 * ------------------------------------------------------------------------- */

export async function updateMyLocation(
  userId: string,
  body: { latitude: number; longitude: number }
): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('الحساب غير موجود / Account no longer exists');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { latitude: body.latitude, longitude: body.longitude },
  });
  return toPublicUser(updated);
}

/* ---------------------------------------------------------------------------
 * Captain self-managed availability — PATCH /auth/me/availability
 * ------------------------------------------------------------------------- */

export async function setAvailability(
  userId: string,
  body: SetAvailabilityBody
): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('الحساب غير موجود / Account no longer exists');
  if (user.role !== UserRole.CAPTAIN) {
    throw unprocessable('NOT_A_CAPTAIN', 'هذا الخيار لكابتن التوصيل فقط / Only captains may set availability');
  }
  if (body.isAvailable && !user.isActive) {
    throw unprocessable(
      'ACCOUNT_INACTIVE',
      'حسابك موقوف، تواصل مع المشرف / Your account is deactivated — contact an admin'
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isAvailable: body.isAvailable },
  });
  return toPublicUser(updated);
}

/* ---------------------------------------------------------------------------
 * Admin user management — GET /users and PATCH /users/:id
 * ------------------------------------------------------------------------- */

export async function listUsers(query: UserListQuery): Promise<Paginated<PublicUser>> {
  const where: Prisma.UserWhereInput = {
    ...(query.role !== undefined ? { role: query.role } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search
      ? {
          OR: [
            { name: caseInsensitiveContains(query.search) },
            { phone: { contains: query.search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: rows.map(toPublicUser),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

export async function adminUpdateUser(
  targetId: string,
  body: AdminUpdateUserBody
): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) throw notFound('المستخدم غير موجود / User not found');
  if (body.assignedStoreId !== undefined) {
    if (user.role !== UserRole.CAPTAIN) {
      throw unprocessable('NOT_A_CAPTAIN', 'المستخدم ليس كابتن توصيل / User is not a captain');
    }
    if (body.assignedStoreId !== null) {
      const store = await prisma.store.findUnique({ where: { id: body.assignedStoreId }, select: { id: true } });
      if (!store) throw notFound('المتجر غير موجود / Store not found');
    }
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.isVerified !== undefined ? { isVerified: body.isVerified } : {}),
      ...(body.assignedStoreId !== undefined ? { assignedStoreId: body.assignedStoreId } : {}),
    },
  });

  return toPublicUser(updated);
}

/** PATCH /captains/:id/verify — admin confirms a CAPTAIN account. */
export async function verifyCaptain(captainId: string): Promise<PublicUser> {
  const captain = await prisma.user.findUnique({ where: { id: captainId } });
  if (!captain) throw notFound('الكابتن غير موجود / Captain not found');
  if (captain.role !== UserRole.CAPTAIN) {
    throw unprocessable('NOT_A_CAPTAIN', 'المستخدم ليس كابتن توصيل / User is not a captain');
  }

  const updated = await prisma.user.update({
    where: { id: captainId },
    data: { isVerified: true },
  });
  return toPublicUser(updated);
}

/** POST /admin/stores — admin creates a store plus its STORE_MANAGER account. */
export async function adminCreateStore(
  body: AdminCreateStoreBody
): Promise<{ user: PublicUser; store: Store }> {
  const existing = await prisma.user.findUnique({ where: { phone: body.phone } });
  if (existing) {
    throw conflict('رقم الجوال مسجّل مسبقاً / This phone number is already registered');
  }

  const user = await prisma.user.create({
    data: {
      name: body.managerName ?? body.nameAr,
      phone: body.phone,
      // An admin-provided password lets the owner log in with phone+password;
      // otherwise a random hash keeps the account unguessable (OTP login only).
      passwordHash: await hashPassword(
        body.password ?? `otp-${randomInt(0, 1_000_000_000)}-${Date.now()}`
      ),
      role: UserRole.STORE_MANAGER,
      isActive: true,
      isVerified: true,
    },
  });

  const store = await prisma.store.create({
    data: {
      nameAr: body.nameAr,
      nameEn: body.nameEn,
      phone: body.phone,
      isActive: body.isActive,
      isApproved: true,
      managerId: user.id,
    },
  });

  return { user: toPublicUser(user), store };
}

/** POST /admin/captains — admin creates a new delivery captain. */
export async function adminCreateCaptain(body: AdminCreateCaptainBody): Promise<PublicUser> {
  const store = await prisma.store.findUnique({ where: { id: body.assignedStoreId } });
  if (!store) {
    throw notFound('المتجر غير موجود / Store not found');
  }

  const existing = await prisma.user.findUnique({ where: { phone: body.phone } });
  if (existing) {
    throw conflict('رقم الجوال مسجّل مسبقاً / This phone number is already registered');
  }

  const user = await prisma.user.create({
    data: {
      name: body.nameAr,
      phone: body.phone,
      passwordHash: await hashPassword(
        body.password ?? `otp-${randomInt(0, 1_000_000_000)}-${Date.now()}`
      ),
      role: UserRole.CAPTAIN,
      isActive: true,
      isVerified: body.isVerified,
      assignedStoreId: body.assignedStoreId,
    },
  });

  return toPublicUser(user);
}

/* ---------------------------------------------------------------------------
 * Admin deletion — soft delete everywhere, with a hard-delete attempt for
 * drivers whose profile data can be removed without breaking the audit trail.
 * ------------------------------------------------------------------------- */

/**
 * DELETE /admin/stores/:id — closes the shopfront and disables the owner.
 * Hard-deleting a Store would cascade categories/products/favorites, but
 * `Order.store` is `onDelete: Restrict`, so any store with orders cannot be
 * removed anyway. Soft-delete is the only safe path, and it is the same
 * semantic the public catalogue already honours (`isActive && isApproved`).
 */
export async function adminDeleteStore(storeId: string): Promise<{ removed: boolean }> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, managerId: true },
  });
  if (!store) throw notFound('المتجر غير موجود / Store not found');

  await prisma.$transaction([
    prisma.store.update({
      where: { id: storeId },
      data: { isActive: false, isApproved: false },
    }),
    prisma.user.updateMany({
      where: { id: store.managerId, role: UserRole.STORE_MANAGER },
      data: { isActive: false },
    }),
  ]);
  await revokeAllUserRefreshTokens(store.managerId);

  return { removed: true };
}

/**
 * DELETE /admin/drivers/:id — removes the captain and their profile data.
 * Tries a hard delete first (captain location, refresh tokens, favorites and
 * wallets cascade). Falls back to a deactivation + profile clear when referential
 * history (chat messages, ratings) blocks removal — the account is then
 * unusable, offline, and unassigned.
 */
export async function adminDeleteDriver(userId: string): Promise<{ removed: boolean }> {
  const driver = await prisma.user.findUnique({ where: { id: userId } });
  if (!driver) throw notFound('السائق غير موجود / Driver not found');
  if (driver.role !== UserRole.CAPTAIN) {
    throw unprocessable('NOT_A_CAPTAIN', 'المستخدم ليس سائق توصيل / User is not a driver');
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
    return { removed: true };
  } catch (cause) {
    // P2003 = foreign-key constraint (orders/chat/rating history that must not
    // be destroyed). Deactivate instead of breaking the audit trail.
    if (!(cause instanceof Error) || !('code' in cause) || (cause as { code?: string }).code !== 'P2003') {
      throw cause;
    }
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { isActive: false, isAvailable: false, assignedStoreId: null },
    }),
    prisma.captainLocation.deleteMany({ where: { captainId: userId } }),
  ]);
  await revokeAllUserRefreshTokens(userId);

  return { removed: true };
}

/**
 * DELETE /admin/users/:id — safe deactivation for any account.
 * Accounts are never hard-deleted (orders, ratings and chat history reference
 * them); `isActive: false` blocks sign-in immediately and kills live sessions.
 */
export async function adminDeleteUser(
  userId: string,
  actingAdminId: string
): Promise<{ removed: boolean }> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound('المستخدم غير موجود / User not found');
  if (target.role === UserRole.ADMIN) {
    throw forbidden('لا يمكن حذف حساب مشرف / Admin accounts cannot be removed');
  }
  if (target.id === actingAdminId) {
    throw forbidden('لا يمكنك حذف حسابك الخاص / You cannot remove your own account');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });
  await revokeAllUserRefreshTokens(userId);

  return { removed: true };
}
