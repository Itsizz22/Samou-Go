import { useState, useEffect } from "react";
import { getOrder } from "./api";
import { formatWhatsAppLink } from "@samou-go/shared-types";
export function StoreCaptainContact({
  orderId,
  captainId,
}: {
  orderId: string;
  captainId: string | null;
}) {
  const [contact, setContact] = useState<{
    name: string;
    phone: string;
    whatsappNumber?: string | null;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const order = await getOrder(orderId);
      setContact(order.captain);
      setMessage(order.captain ? "" : "بانتظار تعيين الكابتن");
    } catch {
      setMessage("تعذر تحميل بيانات الكابتن. حاول مجددًا.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (captainId) void load();
  }, [orderId, captainId]);
  if (!captainId)
    return <p className="my-3 text-sm text-ink-muted">بانتظار تعيين الكابتن</p>;
  return (
    <section className="my-3 space-y-3 rounded-xl border border-line bg-canvas p-3 text-start">
      <button
        type="button"
        disabled={busy}
        onClick={() => void load()}
        className="min-h-11 font-bold text-brand"
      >
        {busy ? "جارٍ التحميل…" : "بيانات الكابتن والتواصل"}
      </button>
      {contact && (
        <>
          <p className="font-bold">{contact.name}</p>
          <a
            className="block text-brand"
            dir="ltr"
            href={`tel:${contact.phone}`}
          >
            {contact.phone}
          </a>
          <div className="flex flex-wrap gap-2">
            <a
              className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-brand"
              href={`tel:${contact.phone}`}
            >
              اتصال بالكابتن
            </a>
            <a
              className="inline-flex min-h-11 items-center rounded-xl bg-brand px-3 text-white"
              href={
                formatWhatsAppLink(
                  contact.whatsappNumber || contact.phone,
                  "مرحبا اريد الاستفسار عن الطلب",
                ) ?? undefined
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              واتساب الكابتن
            </a>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line px-3 font-bold text-brand"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("samou:open-order-chat", {
                  detail: { orderId, peerId: captainId },
                }),
              )
            }
          >
            محادثة الكابتن داخل التطبيق
          </button>
        </>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  );
}
