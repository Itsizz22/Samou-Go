import jwt from 'jsonwebtoken';
import { UserRole } from '@samou-go/shared-types';
import type { JwtPayload } from '@samou-go/shared-types';
import { env } from '../config/env';
import { unauthorized } from './http-error';

export interface IssuedToken {
  accessToken: string;
  /** Seconds from now until the token expires. */
  expiresIn: number;
}

export function signAccessToken(input: {
  userId: string;
  role: UserRole;
  phone: string;
}): IssuedToken {
  const accessToken = jwt.sign(
    { role: input.role, phone: input.phone },
    env.jwt.secret,
    {
      subject: input.userId,
      // The env value is a duration string like '7d'; @types/jsonwebtoken
      // narrows this to a template literal union, so widen it here.
      expiresIn: env.jwt.expiresIn as jwt.SignOptions['expiresIn'],
    }
  );

  const decoded = jwt.decode(accessToken);
  const expiresIn =
    decoded && typeof decoded === 'object' && typeof decoded.exp === 'number'
      ? decoded.exp - Math.floor(Date.now() / 1000)
      : 0;

  return { accessToken, expiresIn };
}

/** The roles that may ever appear in a token — anything else is a forgery. */
const VALID_ROLES = new Set<string>(Object.values(UserRole));

/** Throws 401 rather than leaking the underlying jsonwebtoken error text. */
export function verifyAccessToken(token: string): JwtPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.jwt.secret);
  } catch {
    throw unauthorized('الجلسة غير صالحة أو منتهية / Invalid or expired session');
  }

  // Validate the CLAIMS, never trust their presence blindly. `sub` is the user
  // id and `role` the authorization scope; both must exist and be sane. RBAC
  // downstream is built entirely on this object — the client payload can never
  // override it because only the signature holder can mint it.
  if (!decoded || typeof decoded !== 'object') {
    throw unauthorized('الجلسة غير صالحة / Malformed token');
  }

  const sub = (decoded as { sub?: unknown }).sub;
  const role = (decoded as { role?: unknown }).role;
  const phone = (decoded as { phone?: unknown }).phone;

  if (
    typeof sub !== 'string' ||
    sub.length === 0 ||
    typeof role !== 'string' ||
    !VALID_ROLES.has(role) ||
    typeof phone !== 'string'
  ) {
    throw unauthorized('الجلسة غير صالحة / Malformed token');
  }

  return decoded as unknown as JwtPayload;
}
