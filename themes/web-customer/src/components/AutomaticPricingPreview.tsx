import { useEffect, useState } from 'react';
import { quoteOrder, usePlatformSettings } from '@samou-go/api-client';
import { useCart } from './CartProvider';
import { useDeliveryZone } from './ZoneProvider';
import { formatCurrency } from '@/lib/delivery';
export function AutomaticPricingPreview() {
  const cart = useCart();
  const zone = useDeliveryZone();
  const settings = usePlatformSettings({ pollMs: 15000 });
  const [fee, setFee] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const enabled = settings.data?.autoPricingEnabled ?? false;
  useEffect(() => {
    if (!enabled || !cart.lines.length) return;
    const controller = new AbortController();
    setFee(null);
    setError(false);
    Promise.all(
      cart.storeGroups.map(async group => {
        if (group.fulfillmentType === 'PICKUP') return 0;
        const result = await quoteOrder(
          {
            storeId: group.storeId,
            deliveryZoneId: zone.activeZone?.id,
            items: group.lines.map(line => ({
              productId: line.productId,
              isOfferItem: line.isOfferItem,
              offerId: line.offerId,
              quantity: line.quantity,
              selectedOptions: line.selectedOptions?.map(option => ({
                groupId: option.groupId,
                optionId: option.id,
              })),
            })),
          },
          controller.signal
        );
        return result.deliveryFee;
      })
    )
      .then(fees => {
        if (!controller.signal.aborted) setFee(fees.reduce((sum, value) => sum + value, 0));
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [
    enabled,
    cart.storeGroups,
    zone.activeZone?.id,
    settings.data?.baseDeliveryFee,
    settings.data?.updatedAt,
    revision,
  ]);
  if (!enabled || !cart.lines.length) return null;
  return (
    <section
      className="my-4 rounded-2xl border border-brand/20 bg-brand/5 p-4 text-ink"
      aria-live="polite"
    >
      <h3 className="font-bold">تكلفة التوصيل — {zone.activeZone?.nameAr ?? 'الرسم الأساسي'}</h3>
      {error ? (
        <button
          className="min-h-11 text-danger-ink"
          onClick={() => setRevision(value => value + 1)}
        >
          تعذر حساب التسعير — إعادة المحاولة
        </button>
      ) : fee === null ? (
        <p>جارٍ احتساب السعر...</p>
      ) : (
        <>
          <p className="mt-2" dir="ltr">
            {formatCurrency(fee)}
          </p>
          <p className="mt-2 font-bold">
            الإجمالي <span dir="ltr">{formatCurrency(cart.subtotal + fee)}</span>
          </p>
        </>
      )}
    </section>
  );
}
