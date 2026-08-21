/**
 * Samou' Go — Firebase ID token verification.
 *
 * Verifies a Firebase ID token (JWT) sent by the client after Firebase Phone
 * Auth succeeds. The server uses the Firebase Admin SDK to validate the token,
 * then finds or creates the user account and issues a Samou' Go session.
 *
 * This replaces the server-side OTP flow for customer sign-in. The server
 * never sees the OTP code — Firebase handles the entire verification.
 */

import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { signAccessToken } from '../../lib/jwt';
import { issueRefreshToken } from './refresh-token';
import { toPublicUser } from './auth.mapper';
import { hashPassword } from '../../lib/password';
import { randomInt } from 'node:crypto';
import { UserRole, type AuthResponse } from '@samou-go/shared-types';

// Lazy-loaded Firebase Admin instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let firebaseAdmin: any = null;
let initialised = false;

/** Lazy-initialise Firebase Admin SDK. Safe to call multiple times. */
async function getFirebaseAdmin(): Promise<any> {
  if (initialised) return firebaseAdmin;

  if (!env.firebase.serviceAccountPath && !env.firebase.serviceAccountJson) {
    initialised = true;
    return null;
  }

  try {
    const admin = await import('firebase-admin/app') as Record<string, any>;

    if (admin.getApps().length === 0) {
      // Support both file path (local dev) and inline JSON string (Render / cloud).
      let serviceAccount: Record<string, string>;
      if (env.firebase.serviceAccountJson) {
        serviceAccount = JSON.parse(env.firebase.serviceAccountJson);
      } else {
        const fs = await import('node:fs/promises');
        const nodePath = await import('node:path');
        const keyPath = nodePath.resolve(env.firebase.serviceAccountPath!);
        serviceAccount = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: env.firebase.projectId ?? serviceAccount.project_id,
      });
    }

    firebaseAdmin = admin;
    initialised = true;
    return firebaseAdmin;
  } catch (err) {
    console.error('[firebase] Failed to initialise Firebase Admin SDK:', err);
    initialised = true;
    return null;
  }
}

/**
 * Verify a Firebase ID token and create a Samou' Go session.
 *
 * Flow:
 *   1. Verify the ID token with Firebase Admin SDK
 *   2. Extract phone number from the token
 *   3. Find or create the user account
 *   4. Issue Samou' Go access + refresh tokens
 */
export async function verifyFirebaseToken(
  idToken: string,
  name?: string
): Promise<AuthResponse> {
  const admin = await getFirebaseAdmin();
  if (!admin) {
    throw new Error('Firebase is not configured on this server');
  }

  // Verify the ID token with Firebase Admin SDK.
  // This validates the signature, expiry, audience, and issuer.
  const auth = await import('firebase-admin/auth') as Record<string, any>;
  const decodedToken = await auth.getAuth().verifyIdToken(idToken);

  // Extract the phone number from the verified token.
  const phone = decodedToken.phone_number;
  if (!phone) {
    throw new Error('Firebase token does not contain a phone number');
  }

  // Convert E.164 to canonical local form (05XXXXXXXX).
  const { fromE164 } = await import('../../lib/sms/phone.js');
  const localPhone = fromE164(phone, env.sms.countryCode);

  // Find or create the user account.
  const user = await findOrCreateCustomer(localPhone, name);

  // Issue Samou' Go session tokens.
  const { accessToken, expiresIn } = signAccessToken({
    userId: user.id,
    role: user.role,
    phone: user.phone,
  });
  const refreshToken = await issueRefreshToken(user.id);

  return {
    user: toPublicUser(user),
    accessToken,
    expiresIn,
    refreshToken,
  };
}

/**
 * Find an existing customer or create a new one.
 * Identical logic to the server-side OTP flow — this ensures consistent
 * account provisioning regardless of which auth method was used.
 */
async function findOrCreateCustomer(phone: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    if (!existing.isActive) {
      throw new Error('الحساب موقوف / This account has been deactivated');
    }
    return existing;
  }

  return prisma.user.create({
    data: {
      name: name?.trim() || 'عميل / Customer',
      phone,
      isVerified: true,
      passwordHash: await hashPassword(
        `otp-${randomInt(0, 1_000_000_000)}-${Date.now()}`
      ),
      role: UserRole.CUSTOMER,
    },
  });
}
