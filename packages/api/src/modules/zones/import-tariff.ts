import { prisma } from '../../lib/prisma';
import { unprocessable } from '../../lib/http-error';
import { samouTariff } from './samou-tariff';
import { getRoutePricing, routePair } from './route-pricing';

/** Explicit admin action; preserves IDs, historical orders and unrelated zones. */
export async function importSamouTariff(revision: number) {
  return prisma.$transaction(async tx => {
    await tx.deliveryPricingConfig.upsert({ where: { id: 'routes' }, create: { id: 'routes' }, update: {} });
    const locked = await tx.deliveryPricingConfig.updateMany({ where: { id: 'routes', revision }, data: { enabled: false, revision: { increment: 1 } } });
    if (locked.count !== 1) throw unprocessable('PRICING_CHANGED', 'أعد تحميل جدول الأسعار قبل الاستيراد');
    const existing = await tx.deliveryZone.findMany();
    const aliases: Record<string, string> = { 'لحصيني': 'الحصيني', 'لمدورة': 'المدورة' };
    const ids = new Map<string, string>();
    for (const [sortOrder, nameAr] of samouTariff.zones.entries()) {
      const matches = existing.filter(z => (aliases[z.nameAr.trim()] ?? z.nameAr.trim()) === nameAr);
      if (matches.length > 1) throw unprocessable('DUPLICATE_ZONE', `يوجد أكثر من سجل للمنطقة: ${nameAr}`);
      const found = matches[0];
      const zone = found
        ? await tx.deliveryZone.update({ where: { id: found.id }, data: { nameAr, sortOrder, isActive: true } })
        : await tx.deliveryZone.create({ data: { nameAr, nameEn: nameAr, sortOrder, isActive: false, deliveryFee: samouTariff.rates.find(r => r.from === nameAr && r.to === nameAr)?.fee ?? 0, allowCaptainPricing: false } });
      ids.set(nameAr, zone.id);
    }
    // Retire, do not delete: preserve references and recorded order fees.
    await tx.deliveryZone.updateMany({ where: { nameAr: 'الدير رافات' }, data: { isActive: false } });
    const importedIds = [...ids.values()];
    await tx.deliveryRouteRate.deleteMany({ where: { fromZoneId: { in: importedIds }, toZoneId: { in: importedIds } } });
    await tx.deliveryRouteRate.createMany({ data: samouTariff.rates.map(r => {
      const a = ids.get(r.from), b = ids.get(r.to);
      if (!a || !b) throw new Error('Invalid tariff zone');
      return { ...routePair(a, b), fee: r.fee };
    }) });
    return getRoutePricing(tx);
  }, { timeout: 60000 });
}
