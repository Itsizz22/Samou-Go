import type { NextFunction, Request, Response } from 'express';
import type { JwtPayload, UserRole } from '@samou-go/shared-types';
import { forbidden, unauthorized } from '../lib/http-error';
import { verifyAccessToken } from '../lib/jwt';

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;

  return token.trim() || null;
}

/** Hard gate: 401 unless a valid bearer token is present. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = readBearerToken(req);
  if (!token) {
    next(unauthorized());
    return;
  }

  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Soft gate: attaches `req.auth` when a valid token is present, but lets
 * anonymous requests through. Used by the public catalogue so a logged-in
 * customer can get personalised data from the same endpoint.
 */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = readBearerToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    req.auth = verifyAccessToken(token);
  } catch {
    // A bad token on a public route is simply ignored.
  }
  next();
}

/** Role gate. Always mount AFTER `authenticate`. */
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    if (roles.length > 0 && !roles.includes(req.auth.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}

/** Narrowing helper for controllers mounted behind `authenticate`. */
export function requireAuth(req: Request): JwtPayload {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
