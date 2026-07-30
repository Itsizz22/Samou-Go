import type { AuthResponse, PublicUser } from '@samou-go/shared-types';
import { UserRole } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { conflict, forbidden, unauthorized } from '../../lib/http-error';
import { signAccessToken } from '../../lib/jwt';
import { hashPassword, verifyPassword } from '../../lib/password';
import { toPublicUser } from './auth.mapper';
import type { LoginBody, RegisterBody } from './auth.schemas';

/** Roles a caller may create without being an admin. */
const SELF_SERVICE_ROLES: readonly UserRole[] = [UserRole.CUSTOMER];

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

  const user = await prisma.user.create({
    data: {
      name: body.name,
      phone: body.phone,
      passwordHash: await hashPassword(body.password),
      role: requestedRole,
    },
  });

  const { accessToken, expiresIn } = signAccessToken({
    userId: user.id,
    role: user.role,
    phone: user.phone,
  });

  return { user: toPublicUser(user), accessToken, expiresIn };
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

  const { accessToken, expiresIn } = signAccessToken({
    userId: user.id,
    role: user.role,
    phone: user.phone,
  });

  return { user: toPublicUser(user), accessToken, expiresIn };
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized('الحساب غير موجود / Account no longer exists');
  return toPublicUser(user);
}
