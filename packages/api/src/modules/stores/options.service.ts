import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { forbidden, notFound, unprocessable } from "../../lib/http-error";
import type { Prisma } from "../../lib/prisma-types";
import type { ProductOptionGroup } from "@samou-go/shared-types";
const itemSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  price: z.number().finite().min(0).max(100000).default(0),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  imageUrl: z
    .string()
    .url()
    .max(2048)
    .refine(
      (v) => v.startsWith("https://") || v.startsWith("http://localhost"),
      "رابط الصورة غير صالح",
    )
    .nullable()
    .optional(),
});
const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(["ADDON", "SIZE", "INGREDIENT", "FIXED"]).optional(),
  required: z.boolean().optional(),
  minSelect: z.number().int().min(0).max(50).optional(),
  maxSelect: z.number().int().min(1).max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
  items: z.array(itemSchema).max(50).optional(),
});
type Group = Prisma.ProductOptionGroupGetPayload<{ include: { items: true } }>;
function mapGroup(g: Group): ProductOptionGroup {
  return {
    id: g.id,
    productId: g.productId,
    name: g.name,
    kind: g.kind as ProductOptionGroup["kind"],
    required: g.required,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    sortOrder: g.sortOrder,
    items: g.items.map((i) => ({
      id: i.id,
      groupId: g.id,
      name: i.name,
      priceDelta: i.price,
      sortOrder: i.sortOrder,
      isActive: i.isActive,
      isDefault: i.isDefault,
      imageUrl: i.imageUrl,
    })),
  };
}
async function own(actor: { sub: string; role: string }, storeId: string) {
  if (actor.role === "ADMIN") return;
  if (actor.role !== "STORE_MANAGER") throw forbidden("غير مصرح");
  const s = await prisma.store.findUnique({
    where: { id: storeId },
    select: { managerId: true },
  });
  if (s?.managerId !== actor.sub) throw forbidden("هذا ليس متجرك");
}
function parse(body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success)
    throw unprocessable(
      "INVALID_OPTIONS",
      "راجع أسماء الخيارات وأسعارها وحدود الاختيار",
    );
  return result.data;
}
function rules(body: ReturnType<typeof parse>, existing?: Group) {
  const kind = body.kind ?? existing?.kind ?? "ADDON";
  const items = body.items ?? existing?.items ?? [];
  const active = items.filter((i) => i.isActive !== false);
  const required =
    kind === "SIZE" || kind === "FIXED"
      ? true
      : (body.required ?? existing?.required ?? false);
  const minSelect =
    kind === "SIZE"
      ? 1
      : kind === "FIXED"
        ? active.length
        : (body.minSelect ?? existing?.minSelect ?? 0);
  const maxSelect =
    kind === "SIZE"
      ? 1
      : kind === "FIXED" || kind === "INGREDIENT"
        ? Math.max(1, active.length)
        : (body.maxSelect ?? existing?.maxSelect ?? 1);
  if (minSelect > maxSelect)
    throw unprocessable("MIN_GT_MAX", "الحد الأدنى أكبر من الأقصى");
  if (required && Math.max(1, minSelect) > active.length)
    throw unprocessable(
      "MIN_UNAVAILABLE",
      "عدد الخيارات المتاحة أقل من الحد المطلوب",
    );
  if (
    (kind === "FIXED" || kind === "INGREDIENT") &&
    items.some((i) => (i.price ?? 0) !== 0)
  )
    throw unprocessable(
      "INGREDIENT_PRICE",
      "المكونات المشمولة مجانية؛ استخدم مجموعة إضافات للخيارات المدفوعة",
    );
  if (kind === "SIZE" && active.some((i) => (i.price ?? 0) <= 0))
    throw unprocessable("SIZE_PRICE", "حدد سعرًا كاملاً أكبر من صفر لكل حجم");
  if (active.filter((i) => i.isDefault).length > maxSelect)
    throw unprocessable(
      "DEFAULT_LIMIT",
      "الخيارات الافتراضية تتجاوز الحد المسموح",
    );
  return { kind, required, minSelect, maxSelect };
}
export async function listOptionGroups(
  actor: { sub: string; role: string },
  storeId: string,
  productId: string,
) {
  await own(actor, storeId);
  const p = await prisma.product.findUnique({ where: { id: productId } });
  if (p?.storeId !== storeId) throw notFound("المنتج غير موجود");
  return (
    await prisma.productOptionGroup.findMany({
      where: { productId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    })
  ).map(mapGroup);
}
export async function createOptionGroup(
  actor: { sub: string; role: string },
  storeId: string,
  productId: string,
  raw: unknown,
) {
  await own(actor, storeId);
  const body = parse(raw);
  if (!body.name) throw unprocessable("NAME_REQUIRED", "اسم المجموعة مطلوب");
  const p = await prisma.product.findUnique({ where: { id: productId } });
  if (p?.storeId !== storeId) throw notFound("المنتج غير موجود");
  const config = rules(body);
  return prisma.$transaction(async (tx) => {
    if (
      config.kind === "SIZE" &&
      (await tx.productOptionGroup.findFirst({
        where: { productId, kind: "SIZE" },
      }))
    )
      throw unprocessable("DUPLICATE_SIZE", "توجد مجموعة أحجام لهذا المنتج");
    const g = await tx.productOptionGroup.create({
      data: {
        productId,
        name: body.name!,
        ...config,
        sortOrder: body.sortOrder ?? 0,
        items: { create: (body.items ?? []).map(({ id, ...i }) => i) },
      },
      include: { items: true },
    });
    return mapGroup(g);
  });
}
export async function updateOptionGroup(
  actor: { sub: string; role: string },
  storeId: string,
  groupId: string,
  raw: unknown,
) {
  await own(actor, storeId);
  const body = parse(raw);
  return prisma.$transaction(async (tx) => {
    const g = await tx.productOptionGroup.findUnique({
      where: { id: groupId },
      include: { items: true, product: { select: { storeId: true } } },
    });
    if (!g) throw notFound("المجموعة غير موجودة");
    if (g.product.storeId !== storeId) throw forbidden("غير مصرح");
    const config = rules(body, g);
    if (
      config.kind === "SIZE" &&
      (await tx.productOptionGroup.findFirst({
        where: { productId: g.productId, kind: "SIZE", id: { not: groupId } },
      }))
    )
      throw unprocessable("DUPLICATE_SIZE", "توجد مجموعة أحجام لهذا المنتج");
    if (body.items) {
      const ids = body.items.flatMap((i) => (i.id ? [i.id] : []));
      if (
        new Set(ids).size !== ids.length ||
        ids.some((id) => !g.items.some((i) => i.id === id))
      )
        throw unprocessable("INVALID_OPTION", "الخيار لا ينتمي لهذه المجموعة");
      await tx.productOptionItem.deleteMany({
        where: { groupId, id: { notIn: ids } },
      });
      for (const { id, ...item } of body.items) {
        if (id)
          await tx.productOptionItem.update({ where: { id }, data: item });
        else await tx.productOptionItem.create({ data: { ...item, groupId } });
      }
    }
    await tx.productOptionGroup.update({
      where: { id: groupId },
      data: {
        ...config,
        ...(body.name ? { name: body.name } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    });
    const updated = await tx.productOptionGroup.findUnique({
      where: { id: groupId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    return mapGroup(updated!);
  });
}
export async function deleteOptionGroup(
  actor: { sub: string; role: string },
  storeId: string,
  groupId: string,
) {
  await own(actor, storeId);
  const g = await prisma.productOptionGroup.findUnique({
    where: { id: groupId },
    include: { product: { select: { storeId: true } } },
  });
  if (!g) throw notFound("المجموعة غير موجودة");
  if (g.product.storeId !== storeId) throw forbidden("غير مصرح");
  await prisma.productOptionGroup.delete({ where: { id: groupId } });
}
