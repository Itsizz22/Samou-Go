import { prisma } from './prisma';
import { verifyAccessToken } from './jwt';
import { unauthorized } from './http-error';

/** Check persistent revocation on every protected request; never cache across requests. */
export async function verifyLiveAccessToken(token: string) {
  const auth = verifyAccessToken(token);
  const version = (auth as typeof auth & { sessionVersion?: unknown }).sessionVersion ?? 0;
  const user = await prisma.user.findUnique({
    where: { id: auth.sub }, select: { isActive: true, role: true, sessionVersion: true },
  });
  if (!user || !user.isActive || user.role !== auth.role || version !== (user.sessionVersion ?? 0)) {
    throw unauthorized('الجلسة ملغاة، يرجى تسجيل الدخول مجدداً / Session revoked — sign in again');
  }
  return auth;
}
