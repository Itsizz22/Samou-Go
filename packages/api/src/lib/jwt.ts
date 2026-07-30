import jwt from 'jsonwebtoken';
import type { JwtPayload, UserRole } from '@samou-go/shared-types';
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

/** Throws 401 rather than leaking the underlying jsonwebtoken error text. */
export function verifyAccessToken(token: string): JwtPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.jwt.secret);
  } catch {
    throw unauthorized('الجلسة غير صالحة أو منتهية / Invalid or expired session');
  }

  if (
    !decoded ||
    typeof decoded !== 'object' ||
    typeof (decoded as { sub?: unknown }).sub !== 'string' ||
    typeof (decoded as { role?: unknown }).role !== 'string'
  ) {
    throw unauthorized('الجلسة غير صالحة / Malformed token');
  }

  return decoded as unknown as JwtPayload;
}
