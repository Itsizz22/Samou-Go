import { z } from "zod";
import type { Prisma } from "../../lib/prisma-types";
import { prisma } from "../../lib/prisma";
import { decimalToNumber } from "../../lib/decimal";
import { unprocessable } from "../../lib/http-error";
export function routePair(a: string, b: string) {
  return a <= b
    ? { fromZoneId: a, toZoneId: b }
    : { fromZoneId: b, toZoneId: a };
}
export const routePricingSchema = z
  .object({
    enabled: z.boolean(),
    revision: z.number().int().nonnegative(),
    rates: z
      .array(
        z
          .object({
            fromZoneId: z.string().min(1).max(100),
            toZoneId: z.string().min(1).max(100),
            fee: z.number().finite().min(0).max(100000).multipleOf(0.01),
          })
          .strict(),
      )
      .max(5000),
  })
  .strict();
export async function getRoutePricing(db: Prisma.TransactionClient = prisma) {
  const config = await db.deliveryPricingConfig.findUnique({
    where: { id: "routes" },
  });
  const rates = await db.deliveryRouteRate.findMany({
    orderBy: [{ fromZoneId: "asc" }, { toZoneId: "asc" }],
  });
  return {
    enabled: config?.enabled ?? false,
    revision: config?.revision ?? 0,
    rates: rates.map((r) => ({ ...r, fee: decimalToNumber(r.fee) })),
  };
}
export async function saveRoutePricing(
  body: z.infer<typeof routePricingSchema>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.deliveryPricingConfig.upsert({
      where: { id: "routes" },
      create: { id: "routes" },
      update: {},
    });
    const locked = await tx.deliveryPricingConfig.updateMany({
      where: { id: "routes", revision: body.revision },
      data: { enabled: body.enabled, revision: { increment: 1 } },
    });
    if (locked.count !== 1)
      throw unprocessable(
        "PRICING_CHANGED",
        "تم تعديل الجدول من جلسة أخرى؛ أعد تحميله",
      );
    const zones = await tx.deliveryZone.findMany();
    const ids = new Set(zones.map((z) => z.id));
    const seen = new Set<string>();
    const rates = body.rates.map((r) => {
      const pair = routePair(r.fromZoneId, r.toZoneId);
      const key = JSON.stringify(pair);
      if (!ids.has(pair.fromZoneId) || !ids.has(pair.toZoneId) || seen.has(key))
        throw unprocessable("INVALID_ROUTE", "منطقة غير موجودة أو مسار مكرر");
      seen.add(key);
      return { ...pair, fee: r.fee };
    });
    if (body.enabled) {
      const active = zones.filter((z) => z.isActive);
      if (!active.length) throw unprocessable("NO_ZONES", "أضف المناطق أولاً");
      for (const a of active)
        for (const b of active)
          if (!seen.has(JSON.stringify(routePair(a.id, b.id))))
            throw unprocessable(
              "MISSING_RATES",
              "أكمل أسعار جميع المناطق، بما فيها التوصيل داخل المنطقة",
            );
      if (
        await tx.store.count({
          where: {
            isActive: true,
            isApproved: true,
            OR: [
              { deliveryZoneId: null },
              { deliveryZoneId: { notIn: active.map((z) => z.id) } },
            ],
          },
        })
      )
        throw unprocessable(
          "STORE_ZONE_REQUIRED",
          "حدد منطقة نشطة لكل متجر معتمد قبل التفعيل",
        );
    }
    await tx.deliveryRouteRate.deleteMany();
    if (rates.length) await tx.deliveryRouteRate.createMany({ data: rates });
    return getRoutePricing(tx);
  });
}
/** null preserves legacy pricing until the administrator explicitly activates the matrix. */
export async function resolveRouteFee(
  db: Prisma.TransactionClient,
  storeId: string,
  destinationId: string | null | undefined,
  pickup = false,
): Promise<number | null> {
  if (pickup) return null;
  const settings = await db.platformSettings.findUnique({
    where: { id: "platform" },
    select: { freeDeliveryEnabled: true },
  });
  if (settings?.freeDeliveryEnabled) return 0;
  const config = await db.deliveryPricingConfig.findUnique({
    where: { id: "routes" },
  });
  if (!config?.enabled) return null;
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { deliveryZoneId: true },
  });
  if (!store?.deliveryZoneId || !destinationId)
    throw unprocessable(
      "ROUTE_ZONE_REQUIRED",
      "يجب تحديد منطقة المتجر ومنطقة التوصيل",
    );
  const active = await db.deliveryZone.count({
    where: {
      id: { in: [...new Set([store.deliveryZoneId, destinationId])] },
      isActive: true,
    },
  });
  if (active !== new Set([store.deliveryZoneId, destinationId]).size)
    throw unprocessable("ROUTE_UNAVAILABLE", "منطقة التوصيل غير متاحة");
  const rate = await db.deliveryRouteRate.findUnique({
    where: {
      fromZoneId_toZoneId: routePair(store.deliveryZoneId, destinationId),
    },
  });
  if (!rate)
    throw unprocessable(
      "ROUTE_UNPRICED",
      "التوصيل بين هاتين المنطقتين غير متاح حاليًا",
    );
  return decimalToNumber(rate.fee);
}
