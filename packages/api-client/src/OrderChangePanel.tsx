import { useState } from "react";
import {
  getOrder,
  getStore,
  proposeOrderChange,
  decideOrderChange,
} from "./api";
import { useResource } from "./useApi";
import {
  formatCurrency,
  normalizeOptionGroups,
  normalizeSelectedOptions,
  type CreateOrderInput,
} from "@samou-go/shared-types";
export function OrderChangePanel({
  orderId,
  manager = false,
}: {
  orderId: string;
  manager?: boolean;
}) {
  const [open, setOpen] = useState(!manager);
  const [items, setItems] = useState<CreateOrderInput["items"]>([]);
  const [draftVersion, setDraftVersion] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const order = useResource(
    `change:${orderId}`,
    (signal) => getOrder(orderId, signal),
    { enabled: open, pollMs: 10000 },
  );
  const store = useResource(
    `change-store:${order.data?.storeId}`,
    (signal) => getStore(order.data!.storeId, signal),
    { enabled: open && Boolean(order.data) },
  );
  const products = store.data?.categories.flatMap((c) => c.products) ?? [];
  const field =
    "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm";
  const seed = () => {
    if (order.data) {
      setDraftVersion(order.data.updatedAt);
      setItems(
        order.data.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          note: i.note ?? "",
          selectedOptions: normalizeSelectedOptions(i.selectedOptions).map(
            (o) => ({ groupId: o.groupId, optionId: o.id }),
          ),
          isOfferItem: i.isOfferItem,
          offerId: i.offerId ?? undefined,
          offerTitle: i.offerTitle ?? undefined,
        })),
      );
    }
  };
  const run = async (action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      await action();
      setMessage("تم الحفظ");
      order.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setPending(false);
    }
  };
  let approvedAmount: number | null = null;
  let proposed: {
    productId: string;
    nameAr?: string;
    quantity: number;
    unitPrice: number;
    selectedOptions?: unknown;
  }[] = [];
  if (order.data?.changeProposal) {
    try {
      const raw: unknown = JSON.parse(order.data.changeProposal);
      if (
        raw &&
        typeof raw === "object" &&
        "netSubtotal" in raw &&
        typeof raw.netSubtotal === "number"
      )
        approvedAmount =
          "autoPriced" in raw &&
          raw.autoPriced &&
          "totalAmount" in raw &&
          typeof raw.totalAmount === "number"
            ? raw.totalAmount
            : raw.netSubtotal;
      if (
        raw &&
        typeof raw === "object" &&
        "lines" in raw &&
        Array.isArray(raw.lines)
      )
        proposed = raw.lines.filter(
          (
            x,
          ): x is {
            productId: string;
            quantity: number;
            unitPrice: number;
            selectedOptions?: unknown;
          } =>
            x &&
            typeof x.productId === "string" &&
            typeof x.quantity === "number" &&
            typeof x.unitPrice === "number",
        );
    } catch {
      /* Malformed proposals cannot be accepted. */
    }
  }
  if (
    !manager &&
    (!order.data?.changeProposal || order.data.status !== "PENDING")
  )
    return null;
  return (
    <section className="mt-3 space-y-3 rounded-xl border border-line bg-surface p-3">
      {manager && (
        <button
          type="button"
          className="min-h-11 font-bold text-brand"
          onClick={() => setOpen(!open)}
        >
          صنف غير متوفر؟ اقترح تعديلًا
        </button>
      )}
      {open && (
        <>
          {order.error && (
            <button type="button" onClick={order.refresh} className="min-h-11">
              تعذر التحميل — إعادة المحاولة
            </button>
          )}
          {order.data && (
            <>
              <p className="text-sm">
                تفضيل الزبون:{" "}
                {order.data.unavailableAction === "REMOVE"
                  ? "حذف الصنف"
                  : order.data.unavailableAction === "SUGGEST"
                    ? "اقتراح بديل"
                    : "الاتصال أولاً"}
              </p>
              {proposed.length > 0 && (
                <div className="rounded-xl bg-brand/10 p-3">
                  <h3 className="font-bold">
                    تعديل مقترح بانتظار موافقة الزبون
                  </h3>
                  {proposed.map((i, index) => (
                    <p key={index} className="mt-2 text-sm">
                      {(typeof i.nameAr === 'string' ? i.nameAr : undefined) ?? products.find((p) => p.id === i.productId)?.nameAr ??
                        order.data?.items.find(
                          (p) => p.productId === i.productId,
                        )?.product.nameAr ??
                        "صنف"}{" "}
                      × {i.quantity} —{" "}
                      <span dir="ltr">
                        {formatCurrency(i.unitPrice * i.quantity)}
                      </span>
                      <span className="block text-xs">
                        {normalizeSelectedOptions(i.selectedOptions)
                          .map((o) => o.name)
                          .join(" + ")}
                      </span>
                    </p>
                  ))}
                  <p className="mt-2 text-sm">
                    قيمة المنتجات قبل الخصم:{" "}
                    <b dir="ltr">
                      {formatCurrency(
                        proposed.reduce(
                          (s, i) => s + i.unitPrice * i.quantity,
                          0,
                        ),
                      )}
                    </b>
                  </p>
                  <p className="mt-2 font-bold">
                    {order.data.autoPriced
                      ? "الإجمالي بعد التعديل"
                      : "قيمة المنتجات بعد الخصم"}
                    :{" "}
                    <span dir="ltr">
                      {approvedAmount === null
                        ? "—"
                        : formatCurrency(approvedAmount)}
                    </span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    التوصيل يبقى وفق إعداد الطلب.
                  </p>
                  {!manager && (
                    <div className="mt-3 flex gap-2">
                      <button
                        disabled={pending || approvedAmount === null}
                        className="min-h-11 rounded-xl bg-brand px-3 text-white"
                        onClick={() =>
                          void run(() =>
                            decideOrderChange(
                              orderId,
                              order.data!.updatedAt,
                              true,
                            ),
                          )
                        }
                      >
                        الموافقة على التعديل
                      </button>
                      <button
                        disabled={pending}
                        className="min-h-11 rounded-xl border border-line px-3"
                        onClick={() =>
                          void run(() =>
                            decideOrderChange(
                              orderId,
                              order.data!.updatedAt,
                              false,
                            ),
                          )
                        }
                      >
                        رفض التعديل
                      </button>
                    </div>
                  )}
                </div>
              )}
              {manager && order.data.status === "PENDING" && (
                <>
                  <button
                    type="button"
                    onClick={seed}
                    className="min-h-11 text-brand"
                  >
                    تحميل أصناف الطلب للتعديل
                  </button>
                  {items.map((item, index) => {
                    const product = products.find(
                      (p) => p.id === item.productId,
                    );
                    return (
                      <div
                        key={index}
                        className="space-y-2 border-b border-line pb-3"
                      >
                        <select
                          aria-label="الصنف البديل"
                          className={field}
                          value={item.productId}
                          onChange={(e) =>
                            setItems(
                              items.map((x, i) =>
                                i === index
                                  ? {
                                      productId: e.target.value,
                                      quantity: x.quantity,
                                      selectedOptions: [],
                                    }
                                  : x,
                              ),
                            )
                          }
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nameAr}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="الكمية"
                          className={field}
                          type="number"
                          min={1}
                          max={99}
                          value={item.quantity}
                          onChange={(e) =>
                            setItems(
                              items.map((x, i) =>
                                i === index
                                  ? { ...x, quantity: Number(e.target.value) }
                                  : x,
                              ),
                            )
                          }
                        />
                        {normalizeOptionGroups(product?.optionGroups).map(
                          (group) => (
                            <fieldset key={group.id}>
                              <legend className="text-sm">{group.name}</legend>
                              {group.items.map((option) => (
                                <label
                                  key={option.id}
                                  className="flex min-h-11 items-center gap-2 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      item.selectedOptions?.some(
                                        (o) => o.optionId === option.id,
                                      ) ?? false
                                    }
                                    onChange={(e) =>
                                      setItems(
                                        items.map((x, i) =>
                                          i === index
                                            ? {
                                                ...x,
                                                selectedOptions: e.target
                                                  .checked
                                                  ? [
                                                      ...(x.selectedOptions ??
                                                        []),
                                                      {
                                                        groupId: group.id,
                                                        optionId: option.id,
                                                      },
                                                    ]
                                                  : (
                                                      x.selectedOptions ?? []
                                                    ).filter(
                                                      (o) =>
                                                        o.optionId !==
                                                        option.id,
                                                    ),
                                              }
                                            : x,
                                        ),
                                      )
                                    }
                                  />
                                  {option.name}
                                </label>
                              ))}
                            </fieldset>
                          ),
                        )}
                        <button
                          type="button"
                          className="min-h-11 text-danger-ink"
                          onClick={() =>
                            setItems(items.filter((_, i) => i !== index))
                          }
                        >
                          حذف الصنف من المقترح
                        </button>
                      </div>
                    );
                  })}
                  {items.length > 0 && (
                    <button
                      type="button"
                      disabled={pending}
                      className="min-h-11 rounded-xl bg-brand px-3 text-white"
                      onClick={() =>
                        void run(() =>
                          proposeOrderChange(orderId, {
                            updatedAt: draftVersion,
                            items,
                          }),
                        )
                      }
                    >
                      إرسال المقترح للزبون
                    </button>
                  )}
                  <p className="text-xs text-ink-muted">
                    لا تُحضّر البديل قبل موافقة الزبون. يجب التواصل أولاً إذا
                    كان هذا اختياره.
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
