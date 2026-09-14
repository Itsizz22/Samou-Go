import { randomUUID } from 'node:crypto';
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
  applyToLinked: z.boolean().optional(),
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
    templateId: g.templateId ?? null,
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
  productId?: string,
) {
  await own(actor, storeId);
  const body = parse(raw);
  return prisma.$transaction(async (tx) => {
    const g = await tx.productOptionGroup.findUnique({
      where: { id: groupId },
      include: { items: true, product: { select: { storeId: true } } },
    });
    if (!g || (productId !== undefined && g.productId !== productId)) throw notFound("المجموعة غير موجودة");
    if (g.product.storeId !== storeId) throw forbidden("غير مصرح");
    if (g.templateId) {
      if (!body.applyToLinked) throw unprocessable('SHARED_CONFIRMATION', 'هذا قالب مشترك؛ أكد تطبيق التعديل على المنتجات المرتبطة أو أنشئ نسخة مستقلة');
      return updateSharedTemplate(tx, storeId, g, body);
    }
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
  productId?: string,
) {
  await own(actor, storeId);
  const g = await prisma.productOptionGroup.findUnique({
    where: { id: groupId },
    include: { product: { select: { storeId: true } } },
  });
  if (!g || (productId !== undefined && g.productId !== productId)) throw notFound("المجموعة غير موجودة");
  if (g.product.storeId !== storeId) throw forbidden("غير مصرح");
  await prisma.productOptionGroup.delete({ where: { id: groupId } });
}


type Actor = { sub: string; role: string };
function configuration(g: Group) {
  return { name: g.name, kind: g.kind, required: g.required, minSelect: g.minSelect,
    maxSelect: g.maxSelect, sortOrder: g.sortOrder,
    items: g.items.map(i => ({ id: i.templateItemId ?? i.id, name: i.name, price: i.price,
      sortOrder: i.sortOrder, isActive: i.isActive, isDefault: i.isDefault, imageUrl: i.imageUrl })) };
}
async function templateLock(tx: Prisma.TransactionClient, storeId: string, templateId: string) {
  const lock = await tx.productOptionTemplate.updateMany({ where: { id: templateId, storeId }, data: { updatedAt: new Date() } });
  if (!lock.count) throw notFound('القالب غير موجود في متجرك');
  const template = await tx.productOptionTemplate.findUniqueOrThrow({ where: { id: templateId } });
  return template;
}
export async function listOptionTemplates(actor: Actor, storeId: string) {
  await own(actor, storeId);
  const rows = await prisma.productOptionTemplate.findMany({ where: { storeId }, orderBy: { name: 'asc' }, include: { _count: { select: { groups: true } } } });
  return rows.map(row => ({ id: row.id, name: row.name, linkedProductCount: row._count.groups }));
}
export async function promoteOptionTemplate(actor: Actor, storeId: string, productId: string, groupId: string) {
  await own(actor, storeId);
  return prisma.$transaction(async tx => {
    // Lock the source group so two clicks cannot create two templates.
    const lock = await tx.productOptionGroup.updateMany({ where: { id: groupId, productId, templateId: null, product: { storeId } }, data: { updatedAt: new Date() } });
    if (!lock.count) throw unprocessable('ALREADY_SHARED', 'المجموعة غير موجودة أو مرتبطة بقالب بالفعل');
    const group = await tx.productOptionGroup.findUniqueOrThrow({ where: { id: groupId }, include: { items: true } });
    const template = await tx.productOptionTemplate.create({ data: { storeId, name: group.name, configuration: JSON.stringify(configuration(group)) } });
    await tx.productOptionGroup.update({ where: { id: groupId }, data: { templateId: template.id } });
    for (const item of group.items) await tx.productOptionItem.update({ where: { id: item.id }, data: { templateItemId: item.id } });
    return { id: template.id, name: template.name, linkedProductCount: 1 };
  });
}
export async function attachOptionTemplate(actor: Actor, storeId: string, productId: string, raw: unknown) {
  await own(actor, storeId);
  const input = z.object({ templateId: z.string().min(1), mode: z.enum(['shared','independent']) }).safeParse(raw);
  if (!input.success) throw unprocessable('INVALID_TEMPLATE', 'اختر القالب وطريقة استخدامه');
  return prisma.$transaction(async tx => {
    const template = await templateLock(tx, storeId, input.data.templateId);
    const product = await tx.product.updateMany({ where: { id: productId, storeId }, data: { updatedAt: new Date() } });
    if (!product.count) throw notFound('المنتج غير موجود');
    const body = parse(JSON.parse(template.configuration));
    const config = rules(body);
    if (await tx.productOptionGroup.findFirst({ where: { productId, OR: [{ templateId: template.id }, ...(config.kind === 'SIZE' ? [{ kind: 'SIZE' }] : [])] } }))
      throw unprocessable('DUPLICATE_TEMPLATE', 'القالب مرتبط بالفعل أو توجد مجموعة أحجام لهذا المنتج');
    const group = await tx.productOptionGroup.create({ data: {
      productId, templateId: input.data.mode === 'shared' ? template.id : null,
      name: body.name!, ...config, sortOrder: body.sortOrder ?? 0,
      items: { create: (body.items ?? []).map(({ id, ...item }) => ({ ...item, templateItemId: input.data.mode === 'shared' ? id : null })) },
    }, include: { items: true } });
    return mapGroup(group);
  });
}
export async function detachOptionTemplate(actor: Actor, storeId: string, productId: string, groupId: string) {
  await own(actor, storeId);
  return prisma.$transaction(async tx => {
    const source = await tx.productOptionGroup.findUnique({ where: { id: groupId }, include: { product: true } });
    if (!source || source.productId !== productId || source.product.storeId !== storeId) throw notFound('المجموعة غير موجودة');
    if (source.templateId) await templateLock(tx, storeId, source.templateId);
    await tx.productOptionGroup.update({ where: { id: groupId }, data: { templateId: null } });
    await tx.productOptionItem.updateMany({ where: { groupId }, data: { templateItemId: null } });
    return mapGroup(await tx.productOptionGroup.findUniqueOrThrow({ where: { id: groupId }, include: { items: true } }));
  });
}
async function updateSharedTemplate(tx: Prisma.TransactionClient, storeId: string, source: Group, patch: ReturnType<typeof parse>) {
  const template = await templateLock(tx, storeId, source.templateId!);
  // Refresh the source after the template lock; all shared updates serialize here.
  const fresh = await tx.productOptionGroup.findUniqueOrThrow({ where: { id: source.id }, include: { items: true } });
  if (fresh.templateId !== template.id) throw unprocessable('TEMPLATE_CHANGED', 'تغير ارتباط المنتج بالقالب؛ حدّث القائمة');
  const existing = configuration(fresh);
  const inputItems = patch.items ?? fresh.items.map(i => ({ ...i, imageUrl: i.imageUrl }));
  const retained = inputItems.flatMap(i => i.id ? [i.id] : []);
  if (new Set(retained).size !== retained.length || retained.some(id => !fresh.items.some(i => i.id === id))) throw unprocessable('INVALID_OPTION', 'تغيرت الخيارات؛ حدّث القالب قبل التعديل');
  const body = parse({ ...existing, ...patch, items: inputItems.map(i => ({ ...i, id: i.id ? fresh.items.find(old => old.id === i.id)!.templateItemId ?? i.id : randomUUID() })) });
  const config = rules(body);
  const groups = await tx.productOptionGroup.findMany({ where: { templateId: template.id }, include: { items: true }, orderBy: { productId: 'asc' } });
  for (const group of groups) {
    await tx.product.update({ where: { id: group.productId }, data: { updatedAt: new Date() } });
    if (config.kind === 'SIZE' && await tx.productOptionGroup.findFirst({ where: { productId: group.productId, kind: 'SIZE', id: { not: group.id } } })) throw unprocessable('DUPLICATE_SIZE', 'أحد المنتجات المرتبطة لديه مجموعة أحجام أخرى');
    const kept = (body.items ?? []).map(i => i.id!);
    await tx.productOptionItem.deleteMany({ where: { groupId: group.id, OR: [{ templateItemId: null }, { templateItemId: { notIn: kept } }] } });
    for (const { id: key, ...item } of body.items ?? []) {
      const current = group.items.find(i => i.templateItemId === key);
      if (current) await tx.productOptionItem.update({ where: { id: current.id }, data: item });
      else await tx.productOptionItem.create({ data: { ...item, groupId: group.id, templateItemId: key } });
    }
    await tx.productOptionGroup.update({ where: { id: group.id }, data: { name: body.name!, ...config, sortOrder: body.sortOrder ?? 0 } });
  }
  await tx.productOptionTemplate.update({ where: { id: template.id }, data: { name: body.name!, configuration: JSON.stringify(body) } });
  return mapGroup(await tx.productOptionGroup.findUniqueOrThrow({ where: { id: source.id }, include: { items: true } }));
}
export async function deleteOptionTemplate(actor: Actor, storeId: string, templateId: string) {
  await own(actor, storeId);
  await prisma.$transaction(async tx => {
    await templateLock(tx, storeId, templateId);
    // Keep product options intact; they become independent when the library entry is removed.
    await tx.productOptionItem.updateMany({ where: { group: { templateId } }, data: { templateItemId: null } });
    await tx.productOptionGroup.updateMany({ where: { templateId }, data: { templateId: null } });
    await tx.productOptionTemplate.delete({ where: { id: templateId } });
  });
}
