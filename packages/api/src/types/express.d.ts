import type { JwtPayload } from '@samou-go/shared-types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `middleware/authenticate.ts`. Absent on public routes. */
      auth?: JwtPayload;
    }
  }
}

export {};
