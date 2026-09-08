import type { DeliveryZone } from '@samou-go/shared-types';
import type { Prisma } from '../../lib/prisma-types';
import { decimalToNumber } from '../../lib/decimal';

/** The row shape every zone query must provide for `toDeliveryZone` to typecheck. */
export type ZoneRow = Prisma.DeliveryZoneGetPayload<Record<string, never>>;

export function toDeliveryZone(zone: ZoneRow): DeliveryZone {
  return {
    id: zone.id,
    nameAr: zone.nameAr,
    nameEn: zone.nameEn,
    deliveryFee: decimalToNumber(zone.deliveryFee),
    fee: decimalToNumber(zone.deliveryFee),
    allowCaptainPricing: zone.allowCaptainPricing,
    isActive: zone.isActive,
    sortOrder: zone.sortOrder,
  };
}
