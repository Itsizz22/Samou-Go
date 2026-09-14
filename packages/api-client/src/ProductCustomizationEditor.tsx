import { AppSelect } from '@samou-go/ui';
import { useEffect, useState } from "react";
import {
  listOptionTemplates, attachOptionTemplate, promoteOptionTemplate, detachOptionTemplate, deleteOptionTemplate,
  createOptionGroup,
  deleteOptionGroup,
  listOptionGroups,
  updateOptionGroup,
  updateProduct,
  uploadImage,
  type OptionGroupInput,
} from "./api";
import type { ProductOptionGroup, ProductOptionTemplateSummary } from "@samou-go/shared-types";
type Draft = Required<
  Pick<
    OptionGroupInput,
    | "name"
    | "kind"
    | "required"
    | "minSelect"
    | "maxSelect"
    | "items"
    | "sortOrder"
  >
>;
const kinds = {
  ADDON: "إضافات وصلصات",
  SIZE: "أحجام وأسعار",
  INGREDIENT: "مكونات قابلة للإزالة",
  FIXED: "مكونات ثابتة",
} as const;
const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink";
const button =
  "min-h-11 rounded-xl border border-line px-3 text-sm font-bold text-brand disabled:opacity-50";
type EditorProps = { storeId: string; productId: string; initialEnabled?: boolean };
export function ProductCustomizationEditor(props: EditorProps) {
  return <ProductEditor key={`${props.storeId}:${props.productId}`} {...props} />;
}
function ProductEditor({
  storeId,
  productId,
  initialEnabled = true,
}: {
  storeId: string;
  productId: string;
  initialEnabled?: boolean;
}) {
  const [templates, setTemplates] = useState<ProductOptionTemplateSummary[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateMode, setTemplateMode] = useState<'shared' | 'independent'>('shared');
  const [applyToLinked, setApplyToLinked] = useState(false);
  const [deleteTemplateConfirm, setDeleteTemplateConfirm] = useState(false);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [groups, setGroups] = useState<ProductOptionGroup[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function load() {
    try {
      const [options, library] = await Promise.all([listOptionGroups(storeId, productId), listOptionTemplates(storeId)]);
      setGroups(options.items); setTemplates(library.items);
      setLoaded(true);
    } catch {
      setMessage("تعذر تحميل الخيارات. حاول مجددًا.");
    }
  }
  useEffect(() => {
    void load();
  }, [storeId, productId]);
  function open(g?: ProductOptionGroup, kind: Draft["kind"] = "ADDON") {
    setEditing(g?.id ?? null);
    setApplyToLinked(false);
    setMessage("");
    setDraft(
      g
        ? {
            name: g.name,
            sortOrder: g.sortOrder,
            kind: g.kind ?? "ADDON",
            required: g.required,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            items: g.items.map((i) => ({
              id: i.id,
              name: i.name,
              price: i.priceDelta,
              isActive: i.isActive,
              isDefault: i.isDefault ?? false,
              imageUrl: i.imageUrl ?? null,
              sortOrder: i.sortOrder,
            })),
          }
        : {
            name: kinds[kind],
            sortOrder: groups.length,
            kind,
            required: false,
            minSelect: 0,
            maxSelect: 1,
            items: [],
          },
    );
  }
  function item(index: number, patch: Partial<Draft["items"][number]>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            items: d.items.map((i, n) =>
              n === index
                ? { ...i, ...patch }
                : patch.isDefault === true &&
                    (d.kind === "SIZE" ||
                      (d.kind === "ADDON" && d.maxSelect === 1))
                  ? { ...i, isDefault: false }
                  : i,
            ),
          }
        : d,
    );
  }
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (!draft.name.trim()) throw Error("أدخل اسم المجموعة");
      if (!draft.items.length) throw Error("أضف خيارًا واحدًا على الأقل");
      const invalid = draft.items.findIndex(
        (item) =>
          !item.name.trim() ||
          !Number.isFinite(item.price ?? 0) ||
          (item.price ?? 0) < 0 ||
          (draft.kind === "SIZE" && (item.price ?? 0) <= 0),
      );
      if (invalid >= 0)
        throw Error(
          `راجع الخيار رقم ${invalid + 1}: أدخل اسمه و${draft.kind === "SIZE" ? "سعر الحجم الكامل أكبر من صفر" : "سعرًا صحيحًا (0 للمجاني)"}`,
        );
      if (
        draft.kind === "ADDON" &&
        (draft.minSelect > draft.maxSelect || draft.maxSelect < 1)
      )
        throw Error(
          "الحد الأقصى يجب أن يكون أكبر من صفر ولا يقل عن الحد الأدنى",
        );
      if (groups.find(g => g.id === editing)?.templateId && !applyToLinked) throw Error("أكد تطبيق التغيير على المنتجات المرتبطة أو افصل القالب أولًا");
      const input = {
        ...draft, applyToLinked,
        items: draft.items.map((i, n) => ({ ...i, sortOrder: n })),
      };
      if (editing) await updateOptionGroup(storeId, productId, editing, input);
      else await createOptionGroup(storeId, productId, input);
      setDraft(null);
      await load();
      setMessage("تم حفظ الخيارات");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  }
  async function templateAction(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); await load(); setDeleteTemplateConfirm(false); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر حفظ القالب'); }
    finally { setBusy(false); }
  }
  async function photo(index: number, file: File) {
    setBusy(true);
    try {
      const result = await uploadImage(
        { kind: "option", resourceId: productId },
        file,
      );
      item(index, { imageUrl: result.url });
    } catch {
      setMessage("تعذر رفع الصورة. حاول مجددًا.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      dir="rtl"
      className="space-y-3 rounded-2xl border border-line bg-canvas p-4 text-start text-ink"
    >
      <h3 className="text-base font-bold">تخصيص الوجبة</h3>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={async (e) => {
            const next = e.target.checked;
            setBusy(true);
            try {
              await updateProduct(storeId, productId, { optionsEnabled: next });
              setEnabled(next);
            } catch {
              setMessage("تعذر تغيير حالة الخيارات");
            } finally {
              setBusy(false);
            }
          }}
        />
        عرض الخيارات للزبون
      </label>
      {!enabled && (
        <p className="text-sm text-ink-muted">
          الخيارات مخفية حاليًا؛ يمكنك تعديلها ثم تفعيلها.
        </p>
      )}
      <p className="text-sm leading-6 text-ink-muted">
        رتّب الأحجام والمكونات والإضافات. التغييرات تُحفظ من هنا مباشرة.
      </p>
      {!loaded && (
        <button type="button" className={button} onClick={() => void load()}>
          تحميل الخيارات
        </button>
      )}
      {!draft && loaded && <fieldset disabled={busy} className="space-y-3 rounded-xl border border-line bg-surface p-3">
        <legend className="px-1 text-sm font-bold">قوالب متجرك</legend>
        <p className="text-xs leading-6 text-ink-muted">احفظ الإضافات مرة واحدة، ثم استخدمها مع بقية المنتجات.</p>
        {templates.length > 0 ? <>
          <AppSelect aria-label="القالب المحفوظ" className={field} value={selectedTemplate} onChange={e => { setSelectedTemplate(e.target.value); setDeleteTemplateConfirm(false); }}><option value="">اختر قالبًا</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name} — {template.linkedProductCount} منتجات مرتبطة</option>)}</AppSelect>
          <label className="block text-sm">طريقة الاستخدام<AppSelect className={field} value={templateMode} onChange={e => setTemplateMode(e.target.value === 'shared' ? 'shared' : 'independent')}><option value="shared">مشترك — التعديل يحدّث المنتجات المرتبطة</option><option value="independent">نسخة مستقلة — التعديل لهذا المنتج فقط</option></AppSelect></label>
          <button type="button" className={button} disabled={!selectedTemplate} onClick={() => void templateAction(() => attachOptionTemplate(storeId, productId, selectedTemplate, templateMode))}>استخدام القالب</button>
          <button type="button" className={button} disabled={!selectedTemplate} onClick={() => setDeleteTemplateConfirm(!deleteTemplateConfirm)}>حذف من المكتبة</button>
          {deleteTemplateConfirm && <div className="space-y-2 text-sm"><p>سيُحذف القالب من المكتبة وتبقى خيارات المنتجات كنسخ مستقلة.</p><button type="button" className={button} onClick={() => void templateAction(() => deleteOptionTemplate(storeId, selectedTemplate))}>تأكيد حذف القالب</button></div>}
        </> : <p className="text-xs text-ink-muted">من أي مجموعة أدناه، اختر «حفظ كقالب مشترك».</p>}
      </fieldset>}
      {!draft &&
        groups.map((g) => (
          <div
            key={g.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface p-3"
          >
            <div>
              <strong>{g.name}</strong>
              <p className="text-xs text-ink-muted">
                {kinds[g.kind ?? "ADDON"]} · {g.items.length} خيارات
              </p>
            </div>
            <button type="button" className={button} onClick={() => open(g)}>
              تعديل
            </button>
            <p className="w-full text-xs text-ink-muted">{g.templateId ? 'قالب مشترك' : 'خيارات مستقلة لهذا المنتج'}</p>
            <button type="button" className={button} disabled={busy} onClick={() => void templateAction(() => g.templateId ? detachOptionTemplate(storeId, productId, g.id) : promoteOptionTemplate(storeId, productId, g.id))}>{g.templateId ? 'فصل القالب والتعديل لهذا المنتج فقط' : 'حفظ كقالب مشترك'}</button>
          </div>
        ))}
      {!draft && loaded && (
        <div className="space-y-2">
          <p className="text-sm font-bold">ماذا تريد أن تضيف؟</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(kinds) as Draft["kind"][]).map((kind) => (
              <button
                key={kind}
                type="button"
                className={button}
                onClick={() => open(undefined, kind)}
              >
                + {kinds[kind]}
              </button>
            ))}
          </div>
        </div>
      )}
      {draft && (
        <fieldset disabled={busy} className="space-y-4">
          {groups.find(g => g.id === editing)?.templateId && <label className="flex min-h-11 items-start gap-2 rounded-xl border border-line bg-brand-tint p-3 text-sm"><input type="checkbox" checked={applyToLinked} onChange={e => setApplyToLinked(e.target.checked)}/>تطبيق التعديلات على جميع المنتجات المرتبطة بهذا القالب ({templates.find(template => template.id === groups.find(g => g.id === editing)?.templateId)?.linkedProductCount ?? 1})</label>}
          <label className="block text-sm">
            اسم المجموعة
            <input
              className={field}
              value={draft.name}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            نوع الخيارات
            <AppSelect
              className={field}
              value={draft.kind}
              onChange={(e) => {
                const kind = e.target.value as Draft["kind"];
                setDraft({
                  ...draft,
                  kind,
                  items: draft.items.map((i) => ({
                    ...i,
                    price:
                      kind === "FIXED" || kind === "INGREDIENT" ? 0 : i.price,
                    isDefault: false,
                  })),
                });
              }}
            >
              {Object.entries(kinds).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </AppSelect>
          </label>
          {draft.kind === "SIZE" && (
            <p className="text-sm leading-6 text-ink-muted">
              أدخل السعر الكامل لكل حجم قبل الخصم. خصم المنتج يشمل الحجم،
              والإضافات تبقى بسعرها الكامل. يختار الزبون حجمًا واحدًا.
            </p>
          )}
          {draft.kind === "INGREDIENT" && (
            <p className="text-sm">
              المكونات مجانية. فعّل «محدد مسبقًا» للمكونات الموجودة في الوجبة
              ويمكن للزبون إزالتها.
            </p>
          )}
          {draft.kind === "FIXED" && (
            <p className="text-sm">
              مكونات مجانية مشمولة دائمًا ولا يمكن للزبون إزالتها.
            </p>
          )}
          {draft.kind === "ADDON" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.required}
                  onChange={(e) =>
                    setDraft({ ...draft, required: e.target.checked })
                  }
                />
                اختيار إلزامي
              </label>
              <label>
                الحد الأدنى
                <input
                  className={field}
                  type="number"
                  min={0}
                  max={50}
                  value={draft.minSelect}
                  onChange={(e) =>
                    setDraft({ ...draft, minSelect: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                الحد الأقصى
                <input
                  className={field}
                  type="number"
                  min={1}
                  max={50}
                  value={draft.maxSelect}
                  onChange={(e) =>
                    setDraft({ ...draft, maxSelect: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          )}
          {draft.items.map((i, index) => (
            <div
              key={i.id ?? `new-${index}`}
              className="space-y-3 rounded-xl border border-line bg-surface p-3"
            >
              <label className="block text-sm">
                اسم الخيار
                <input
                  className={field}
                  value={i.name}
                  maxLength={120}
                  onChange={(e) => item(index, { name: e.target.value })}
                />
              </label>
              {(draft.kind === "SIZE" || draft.kind === "ADDON") && (
                <label className="block text-sm">
                  {draft.kind === "SIZE"
                    ? "سعر الحجم الكامل (₪)"
                    : "سعر الإضافة (0 = مجانية)"}
                  <input
                    dir="ltr"
                    className={field}
                    type="number"
                    min={0}
                    step="0.01"
                    value={i.price ?? 0}
                    onChange={(e) =>
                      item(index, { price: Number(e.target.value) })
                    }
                  />
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {i.imageUrl && (
                  <img
                    src={i.imageUrl}
                    alt=""
                    className="h-12 w-12 rounded-lg object-contain"
                  />
                )}
                <label className={button}>
                  إرفاق صورة
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void photo(index, file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {i.imageUrl && (
                  <button
                    type="button"
                    className={button}
                    onClick={() => item(index, { imageUrl: null })}
                  >
                    إزالة الصورة
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={i.isActive !== false}
                    onChange={(e) =>
                      item(index, { isActive: e.target.checked })
                    }
                  />
                  متاح
                </label>
                {draft.kind !== "FIXED" && (
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={i.isDefault ?? false}
                      onChange={(e) =>
                        item(index, { isDefault: e.target.checked })
                      }
                    />
                    محدد مسبقًا
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={index === 0}
                  onClick={() => {
                    const items = [...draft.items];
                    [items[index - 1], items[index]] = [
                      items[index]!,
                      items[index - 1]!,
                    ];
                    setDraft({ ...draft, items });
                  }}
                >
                  للأعلى
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={index === draft.items.length - 1}
                  onClick={() => {
                    const items = [...draft.items];
                    [items[index], items[index + 1]] = [
                      items[index + 1]!,
                      items[index]!,
                    ];
                    setDraft({ ...draft, items });
                  }}
                >
                  للأسفل
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      items: draft.items.filter((_, n) => n !== index),
                    })
                  }
                >
                  حذف الخيار
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className={button}
            disabled={draft.items.length >= 50}
            onClick={() =>
              setDraft({
                ...draft,
                items: [
                  ...draft.items,
                  {
                    name: "",
                    price: 0,
                    isActive: true,
                    isDefault: draft.kind === "INGREDIENT",
                  },
                ],
              })
            }
          >
            + إضافة خيار
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl bg-brand px-4 font-bold text-white"
              onClick={() => void save()}
            >
              حفظ المجموعة
            </button>
            <button
              type="button"
              className={button}
              onClick={() => setDraft(null)}
            >
              إلغاء التعديل
            </button>
            {editing && (
              <button
                type="button"
                className={button}
                onClick={async () => {
                  if (!window.confirm("حذف هذه المجموعة وكل خياراتها؟")) return;
                  setBusy(true);
                  try {
                    await deleteOptionGroup(storeId, productId, editing);
                    setDraft(null);
                    await load();
                  } catch {
                    setMessage("تعذر حذف المجموعة");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                حذف المجموعة
              </button>
            )}
          </div>
        </fieldset>
      )}
      <p role="status" className="text-sm">
        {busy ? "جارٍ الحفظ…" : message}
      </p>
    </section>
  );
}
