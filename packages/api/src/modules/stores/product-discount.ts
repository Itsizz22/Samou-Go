import { badRequest } from '../../lib/http-error';
export function validateProductDiscount(price: number, originalPrice?: number | null): void {
  if (originalPrice != null && (!Number.isFinite(originalPrice) || originalPrice <= price)) throw badRequest('السعر بعد الخصم يجب أن يكون أقل من السعر الأصلي / Discount price must be below original price');
}
