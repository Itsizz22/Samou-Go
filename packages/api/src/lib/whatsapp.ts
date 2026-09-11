import { z } from 'zod';
/** Independent contact number; never passes through login/SMS normalization. */
export const whatsappNumberSchema = z.string().trim().regex(/^\+(970|972)5\d{8}$/, 'أدخل رقم واتساب كاملاً بمقدمة 970 أو 972 / Enter a full WhatsApp mobile number').nullable().optional();
