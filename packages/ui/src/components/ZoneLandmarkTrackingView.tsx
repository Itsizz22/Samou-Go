import type { OrderDetail } from "@samou-go/shared-types";
import { formatWhatsAppLink, ORDER_STATUS_LABELS } from "@samou-go/shared-types";
export function ZoneLandmarkTrackingView({
  order,
  contactPhone,
  contactWhatsApp,
}: {
  order: Pick<
    OrderDetail,
    "status" | "deliveryZone" | "customerAddressText" | "addressNote"
  >;
  contactPhone?: string | null;
  contactWhatsApp?: string | null;
}) {
  const steps = ["مستلم", "قيد التحضير", "مع الكابتن", "تم التسليم"];
  const index =
    order.status === "DELIVERED"
      ? 3
      : order.status === "ON_THE_WAY"
        ? 2
        : ["PREPARING", "READY_FOR_PICKUP"].includes(order.status)
          ? 1
          : 0;
  let phone = contactPhone?.replace(/\D/g, "") ?? "";
  if (phone.startsWith("0")) phone = `970${phone.slice(1)}`;
  return (
    <section
      dir="rtl"
      className="rounded-2xl border border-line bg-surface p-4 text-ink"
    >
      <h3 className="font-bold">{ORDER_STATUS_LABELS[order.status].ar}</h3>
      <ol className="my-4 flex gap-2" aria-label="مراحل الطلب">
        {steps.map((step, i) => (
          <li
            key={step}
            aria-current={i === index ? "step" : undefined}
            className={`flex-1 border-t-4 pt-2 text-center text-xs ${order.status !== "CANCELLED" && i <= index ? "border-brand font-bold text-brand" : "border-line text-ink-muted"}`}
          >
            {step}
          </li>
        ))}
      </ol>
      <p className="font-bold">
        {order.deliveryZone?.nameAr ?? "منطقة التوصيل"}
      </p>
      <p className="mt-1 text-sm">{order.customerAddressText}</p>
      {order.addressNote && (
        <p className="mt-1 text-sm text-ink-muted">{order.addressNote}</p>
      )}
      {phone && (
        <div className="mt-4 flex gap-3">
          <a
            className="btn-primary flex min-h-11 flex-1 items-center justify-center"
            href={`tel:+${phone}`}
          >
            اتصال
          </a>
          <a
            className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-brand text-brand"
            href={formatWhatsAppLink(contactWhatsApp || contactPhone || "")}
            target="_blank"
            rel="noreferrer"
          >
            واتساب
          </a>
        </div>
      )}
    </section>
  );
}
