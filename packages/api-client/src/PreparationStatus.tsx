import { useEffect, useState } from "react";
import { reserveOrder, releaseReservation, updatePreparationTime } from "./api";

type PreparationOrder = {
  id: string;
  status: string;
  captainId: string | null;
  estimatedReadyAt?: string | null;
  dispatchExpiresAt?: string | null;
};

export function PreparationCountdown({
  order,
  customer = false,
}: {
  order: PreparationOrder;
  customer?: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  if (order.status !== "ACCEPTED" && order.status !== "PREPARING") return null;
  const remaining = order.estimatedReadyAt
    ? Math.ceil((Date.parse(order.estimatedReadyAt) - now) / 60_000)
    : null;
  return (
    <p className="mt-3 rounded-xl bg-brand/10 p-3 text-sm font-bold text-brand">
      {remaining === null
        ? "المتجر لم يحدد وقت الجاهزية بعد"
        : remaining > 0
          ? `جاهز خلال نحو ${remaining} دقيقة`
          : "بانتظار تأكيد الجاهزية من المتجر"}
      <span className="mt-1 block text-xs font-normal text-ink-muted">
        {customer
          ? remaining !== null && remaining <= 0
            ? "استغرق التحضير وقتاً أطول من التقدير؛ سنحدث الحالة فور تأكيد المتجر."
            : "وقت تقديري للتحضير؛ وقت التوصيل يبدأ بعد استلام الكابتن."
          : "موعد تقديري؛ لا تستلم الطلب قبل تأكيد المتجر."}
      </span>
    </p>
  );
}

export function CaptainReservation({
  order,
  captainId,
  onReserved,
}: {
  order: PreparationOrder;
  captainId?: string;
  onReserved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!order.dispatchExpiresAt || order.captainId) return;
    setNow(Date.now());
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [order.dispatchExpiresAt, order.captainId]);
  const offerSeconds = order.dispatchExpiresAt
    ? Math.max(0, Math.ceil((Date.parse(order.dispatchExpiresAt) - now) / 1000))
    : null;
  if (!["ACCEPTED", "PREPARING", "READY_FOR_PICKUP"].includes(order.status))
    return null;
  if (order.captainId)
    return (
      <div className="mt-3">
        <p className="text-sm font-bold text-brand">
          {order.captainId === captainId
            ? "محجوز لك — ستصلك تنبيهات الجاهزية"
            : "محجوز لكابتن آخر"}
        </p>
        {order.captainId === captainId &&
          (withdrawing ? (
            <form
              className="mt-3 space-y-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (pending) return;
                setPending(true);
                setError("");
                try {
                  await releaseReservation(order.id, reason);
                  setWithdrawing(false);
                  onReserved();
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "تعذر إلغاء الحجز",
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              <label className="block text-sm">
                سبب الاعتذار
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3"
                />
              </label>
              <p className="text-xs text-ink-muted">
                سيُبلّغ المتجر ويُتاح الطلب للكباتن الآخرين. لن يُلغى طلب
                العميل.
              </p>
              <button
                disabled={pending}
                className="min-h-11 rounded-xl bg-brand px-3 font-bold text-white disabled:opacity-50"
              >
                تأكيد الاعتذار
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setWithdrawing(false)}
                className="min-h-11 px-3"
              >
                تراجع
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setWithdrawing(true)}
              className="mt-2 min-h-11 rounded-xl border border-line px-3 text-sm font-bold"
            >
              الاعتذار عن التوصيل
            </button>
          ))}
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger-ink">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <div className="mt-3">
      {offerSeconds !== null && (
        <p className="mb-2 text-sm font-bold text-brand">
          {offerSeconds > 0
            ? `عرض مخصص لك — متبقي ${offerSeconds} ثانية للقبول`
            : "انتهت مهلة العرض؛ حدّث قائمة الطلبات"}
        </p>
      )}
      <p className="mb-2 text-sm font-bold text-brand">
        {order.status === "READY_FOR_PICKUP"
          ? "جاهز للاستلام — متاح للحجز"
          : "قيد التحضير — متاح للحجز"}
      </p>
      <p className="mb-2 text-xs text-ink-muted">
        تتحدث القائمة تلقائياً؛ قد يختفي الطلب إذا حجزه كابتن آخر أو أُلغي.
      </p>
      <button
        type="button"
        disabled={pending || offerSeconds === 0}
        className="min-h-11 w-full rounded-xl bg-brand px-4 py-2 font-bold text-white transition-transform active:scale-95 disabled:opacity-50"
        onClick={async () => {
          if (
            order.dispatchExpiresAt &&
            Date.parse(order.dispatchExpiresAt) <= Date.now()
          ) {
            onReserved();
            return;
          }
          setPending(true);
          setError("");
          try {
            await reserveOrder(order.id);
            onReserved();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "تعذر حجز الطلب");
            onReserved();
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "جارٍ الحجز…" : "قبول التوصيل وحجز الطلب"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}

export function PreparationTimeEditor({ order }: { order: PreparationOrder }) {
  const [minutes, setMinutes] = useState("15");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  if (order.status !== "ACCEPTED" && order.status !== "PREPARING") return null;
  return (
    <form
      className="mt-3 rounded-xl border border-line p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage("");
        try {
          await updatePreparationTime(order.id, Number(minutes));
          setMessage("تم تحديث الموعد وتذكير الكابتن");
        } catch (cause) {
          setMessage(cause instanceof Error ? cause.message : "تعذر التحديث");
        } finally {
          setPending(false);
        }
      }}
    >
      <label className="block text-xs font-bold">
        الوقت المتبقي للتحضير من الآن (دقيقة)
        <input
          type="number"
          dir="ltr"
          required
          min={5}
          max={180}
          step={1}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink"
        />
      </label>
      <button
        disabled={pending}
        className="mt-2 min-h-11 rounded-lg bg-brand/10 px-3 text-sm font-bold text-brand disabled:opacity-50"
      >
        {pending ? "جارٍ الحفظ…" : "تحديث وقت الجاهزية"}
      </button>
      {message && (
        <p role="status" className="mt-2 text-xs">
          {message}
        </p>
      )}
    </form>
  );
}
