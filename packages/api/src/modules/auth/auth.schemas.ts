import { z } from 'zod';
import { UserRole } from '@samou-go/shared-types';

/**
 * Palestinian mobile, stored canonically as `05XXXXXXXX`.
 * Accepts the shapes people actually type — `+970`, `00970`, `+972`, spaces,
 * dashes — and normalises them before validation.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform(value => {
    const digits = value.replace(/[\s-()]/g, '').replace(/^\+/, '');
    if (digits.startsWith('00970')) return `0${digits.slice(5)}`;
    if (digits.startsWith('00972')) return `0${digits.slice(5)}`;
    if (digits.startsWith('970')) return `0${digits.slice(3)}`;
    if (digits.startsWith('972')) return `0${digits.slice(3)}`;
    return digits;
  })
  .pipe(
    z
      .string()
      .regex(/^05\d{8}$/, 'رقم جوال فلسطيني غير صالح / Invalid Palestinian mobile (05XXXXXXXX)')
  );

export const passwordSchema = z
  .string()
  .min(8, 'كلمة المرور 8 أحرف على الأقل / Password must be at least 8 characters')
  .max(128);

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'الاسم قصير جداً / Name is too short')
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
  password: z.string().min(1, 'كلمة المرور مطلوبة / Password is required'),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
