import { z } from "zod";
import { UserRole } from "@samou-go/shared-types";

/**
 * Palestinian mobile, stored canonically as `05XXXXXXXX`.
 * Accepts the shapes people actually type — `+970`, `00970`, `+972`, spaces,
 * dashes — and normalises them before validation.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => {
    const digits = value.replace(/[\s-()]/g, "").replace(/^\+/, "");
    if (digits.startsWith("00970")) return `0${digits.slice(5)}`;
    if (digits.startsWith("00972")) return `0${digits.slice(5)}`;
    if (digits.startsWith("970")) return `0${digits.slice(3)}`;
    if (digits.startsWith("972")) return `0${digits.slice(3)}`;
    return digits;
  })
  .pipe(
    z
      .string()
      .regex(
        /^05\d{8}$/,
        "رقم جوال فلسطيني غير صالح / Invalid Palestinian mobile (05XXXXXXXX)",
      ),
  );

export const passwordSchema = z
  .string()
  .min(
    8,
    "كلمة المرور 8 أحرف على الأقل / Password must be at least 8 characters",
  )
  .max(128);

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "الاسم قصير جداً / Name is too short")
    .max(120),
  phone: phoneSchema,
  password: passwordSchema,
  /**
   * Self-service registration is CUSTOMER-only; the service rejects anything
   * else unless the caller is an authenticated ADMIN.
   */
  role: z.nativeEnum(UserRole).optional(),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "كلمة المرور مطلوبة / Password is required"),
});

/** POST /auth/otp/request — the phoneSchema normalises before the service runs. */
export const otpRequestSchema = z.object({
  phone: phoneSchema,
});

/** POST /auth/otp/verify — 6-digit code, digits only, case/space tolerant. */
export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(
      z
        .string()
        .min(4, "رمز قصير جداً / Code is too short")
        .max(8, "رمز طويل جداً / Code is too long"),
    ),
  name: z.string().trim().min(2).max(120).optional(),
});

/** POST /auth/refresh — exchange a refresh token for a fresh pair. */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20, "رمز غير صالح / Invalid token"),
});

/** POST /auth/password/reset â€” an OTP is the proof of account ownership. */
export const resetPasswordSchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().length(6)),
  password: passwordSchema,
});

/** PATCH /auth/me — caller updates their own profile. */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: phoneSchema.optional(),
    /** Requires currentPassword to be present when provided. */
    newPassword: passwordSchema.optional(),
    currentPassword: z.string().min(1).optional(),
  })
  .refine(
    (data) => {
      // If newPassword is given, currentPassword must also be present.
      if (data.newPassword && !data.currentPassword) return false;
      return true;
    },
    {
      message:
        "كلمة المرور الحالية مطلوبة لتغيير كلمة المرور / currentPassword required to set a new password",
      path: ["currentPassword"],
    },
  )
  .refine((data) => Object.keys(data).length > 0, {
    message:
      "يجب توفير حقل واحد على الأقل للتحديث / At least one field required",
  });

/** PATCH /auth/me/availability — a captain toggles their own online state. */
export const setAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

/** PATCH /users/:id — admin updates any user's account. */
export const adminUpdateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    isActive: z.boolean().optional(),
    role: z.nativeEnum(UserRole).optional(),
    /** CAPTAIN verification — set by the admin dashboard. */
    isVerified: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message:
      "يجب توفير حقل واحد على الأقل للتحديث / At least one field required",
  });

/** PATCH /users/:userId — admin route param. */
export const userIdParamsSchema = z.object({
  userId: z.string().min(1, "معرّف المستخدم مطلوب / userId is required"),
});

/** PATCH /captains/:captainId/verify — admin route param. */
export const captainIdParamsSchema = z.object({
  captainId: z.string().min(1, "معرّف الكابتن مطلوب / captainId is required"),
});

/**
 * POST /auth/logout — the refresh token is OPTIONAL (stateless access tokens
 * are just dropped client-side). When present it is revoked server-side.
 */
export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

/** GET /users — admin list query. */
export const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  search: z.string().trim().min(1).max(120).optional(),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type OtpRequestBody = z.infer<typeof otpRequestSchema>;
export type OtpVerifyBody = z.infer<typeof otpVerifySchema>;
export type RefreshTokenBody = z.infer<typeof refreshTokenSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type SetAvailabilityBody = z.infer<typeof setAvailabilitySchema>;
export type AdminUpdateUserBody = z.infer<typeof adminUpdateUserSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type LogoutBody = z.infer<typeof logoutSchema>;
