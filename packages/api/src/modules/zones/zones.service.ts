import type { DeliveryZone } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/http-error';
import { toDeliveryZone } from './zones.mapper';
import type { CreateDeliveryZoneBody, UpdateDeliveryZoneBody } from './zones.schemas';

/** Public list — active zones only, admin-defined ordering. */
export async function listActiveZones(): Promise<DeliveryZone[]> {
  const zones = await prisma.deliveryZone.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
  });
  return zones.map(toDeliveryZone);
}

/** Admin list — includes inactive zones so the panel can re-enable them. */
export async function listAllZones(): Promise<DeliveryZone[]> {
  const zones = await prisma.deliveryZone.findMany({
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
  });
  return zones.map(toDeliveryZone);
}

export async function createZone(body: CreateDeliveryZoneBody): Promise<DeliveryZone> {
  const zone = await prisma.deliveryZone.create({
    data: {
      nameAr: body.nameAr,
      nameEn: body.nameEn,
      fee: body.fee,
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
    },
  });
  return toDeliveryZone(zone);
}

export async function updateZone(
  zoneId: string,
  body: UpdateDeliveryZoneBody
): Promise<DeliveryZone> {
  const existing = await prisma.deliveryZone.findUnique({ where: { id: zoneId } });
  if (!existing) throw notFound('منطقة التوصيل غير موجودة / Delivery zone not found');

  const zone = await prisma.deliveryZone.update({
    where: { id: zoneId },
    data: {
      ...(body.nameAr !== undefined ? { nameAr: body.nameAr } : {}),
      ...(body.nameEn !== undefined ? { nameEn: body.nameEn } : {}),
      ...(body.fee !== undefined ? { fee: body.fee } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    },
  });
  return toDeliveryZone(zone);
}

/**
 * Deletes a zone. Orders referencing it keep their already-charged fee — the
 * FK is `onDelete: SetNull`, so the zone id is unlinked without rewriting money.
 */
export async function deleteZone(zoneId: string): Promise<void> {
  const existing = await prisma.deliveryZone.findUnique({ where: { id: zoneId } });
  if (!existing) throw notFound('منطقة التوصيل غير موجودة / Delivery zone not found');
  await prisma.deliveryZone.delete({ where: { id: zoneId } });
}