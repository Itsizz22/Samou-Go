import { formatWhatsAppLink } from "@samou-go/shared-types";
export function OrderContactCard({
  title,
  contact,
}: {
  title: string;
  contact: { name: string; phone: string; whatsappNumber?: string | null };
}) {
  const whatsapp = formatWhatsAppLink(
    contact.whatsappNumber || contact.phone,
    "مرحبا اريد الاستفسار عن شيء ما",
  );
  return (
    <section
      dir="rtl"
      className="space-y-3 rounded-xl border border-line bg-canvas p-3 text-start text-sm text-ink"
      aria-label={title}
    >
      <p className="text-xs text-ink-muted">{title}</p>
      <p className="font-bold">{contact.name}</p>
      {contact.phone ? (
        <a
          dir="ltr"
          href={`tel:${contact.phone}`}
          className="block w-fit font-bold text-brand underline"
        >
          {contact.phone}
        </a>
      ) : (
        <p className="text-xs text-ink-muted">رقم التواصل غير متاح حاليًا</p>
      )}
      <div className="flex flex-wrap gap-2">
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-bold text-brand"
          >
            اتصال
          </a>
        )}
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-bold text-white"
          >
            واتساب
          </a>
        )}
      </div>
      {contact.whatsappNumber && contact.whatsappNumber !== contact.phone && (
        <p className="text-xs text-ink-muted">
          رقم واتساب:{" "}
          <span dir="ltr" className="inline-block">
            {contact.whatsappNumber}
          </span>
        </p>
      )}
    </section>
  );
}
