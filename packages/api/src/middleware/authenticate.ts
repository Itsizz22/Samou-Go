import type { NextFunction, Request, Response } from 'express';
import type { JwtPayload, UserRole } from '@samou-go/shared-types';
import { forbidden, unauthorized } from '../lib/http-error';
import { verifyAccessToken } from '../lib/jwt';

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;

  const trimmed = token.trim();
  // `Bearer null`, `Bearer undefined` and bare `Bearer` are phantom sessions
  // (a corrupted client that stringified a null token). Treat them exactly
  // like a missing header: the gate answers 401, never 400.
  if (
    trimmed.length === 0 ||
    trimmed === 'null' ||
    trimmed === 'undefined' ||
    trimmed === 'NaN'
  ) {
    return null;
  }

  return trimmed;
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

/** Allow guests, but reject an invalid supplied session so the client can refresh it. */
export function authenticateIfPresent(req: Request, res: Response, next: NextFunction): void {
  if (req.headers.authorization) authenticate(req, res, next);
  else next();
}

/** Public catalogue gate: ignore invalid credentials and serve anonymous data. */
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
