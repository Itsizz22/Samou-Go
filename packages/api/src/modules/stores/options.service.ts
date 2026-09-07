import { prisma } from '../../lib/prisma';
import { forbidden, notFound, unprocessable } from '../../lib/http-error';
import { badState } from '../../lib/http-error';

export interface OptionGroupDto {
  id: string;
  productId: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  items: {
    id: string;
    groupId: string;
    name: string;
    priceDelta: number;
    sortOrder: number;
    isActive: boolean;
  }[];
}

/**
 * List all option groups for a product. Manager must own the store.
 */
export async function listOptionGroups(
  actor: { sub: string; role: string },
  storeId: string,
  productId: string,
): Promise<OptionGroupDto[]> {
  await assertManagerOwnsStore(actor, storeId);

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.storeId !== storeId) {
    throw notFound('المنتج غير موجود / Product not found');
  }

  const groups = await prisma.productOptionGroup.findMany({
    where: { productId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });

  return groups.map(mapGroup);
}

/**
 * Create a new option group with items for a product.
 */
export async function createOptionGroup(
  actor: { sub: string; role: string },
  storeId: string,
  productId: string,
  body: { name: string; required?: boolean; minSelect?: number; maxSelect?: number; sortOrder?: number; items?: { name: string; price?: number; sortOrder?: number }[] },
): Promise<OptionGroupDto> {
  await assertManagerOwnsStore(actor, storeId);

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.storeId !== storeId) {
    throw notFound('المنتج غير موجود / Product not found');
  }

  if (!body.name?.trim()) {
    throw unprocessable('NAME_REQUIRED', 'اسم المجموعة مطلوب / Group name is required');
  }

  // Enforce 5-item total cap across all groups for this product.
  const incomingItemCount = (body.items ?? []).length;
  const existingGroups = await prisma.productOptionGroup.findMany({
    where: { productId },
    include: { items: { select: { id: true } } },
  });
  const existingItemCount = existingGroups.reduce((sum: number, g: any) => sum + g.items.length, 0);
  if (existingItemCount + incomingItemCount > 5) {
    throw unprocessable(
      'MAX_ITEMS_EXCEEDED',
      `الحد الأقصى المسموح به هو 5 إضافات للمنتج الواحد (${existingItemCount} موجودة + ${incomingItemCount} جديدة)`,
    );
  }
  if ((body.minSelect ?? 0) < 0) throw unprocessable('MIN_INVALID', 'الحد الأدنى غير صالح / minSelect must be >= 0');
  if ((body.maxSelect ?? 1) < 1) throw unprocessable('MAX_INVALID', 'الحد الأقصى غير صالح / maxSelect must be >= 1');
  if ((body.minSelect ?? 0) > (body.maxSelect ?? 1)) {
    throw unprocessable('MIN_GT_MAX', 'الحد الأدنى أكبر من الأقصى / minSelect > maxSelect');
  }

  const group = await prisma.productOptionGroup.create({
    data: {
      productId,
      name: body.name.trim(),
      required: body.required ?? false,
      minSelect: body.minSelect ?? 0,
      maxSelect: body.maxSelect ?? 1,
      sortOrder: body.sortOrder ?? 0,
      items: {
        create: (body.items ?? []).map((item, idx) => ({
          name: item.name.trim(),
          price: item.price ?? 0,
          sortOrder: item.sortOrder ?? idx,
        })),
      },
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });

  return mapGroup(group);
}

/**
 * Update an option group and optionally sync its items (full replacement).
 */
export async function updateOptionGroup(
  actor: { sub: string; role: string },
  storeId: string,
  groupId: string,
  body: { name?: string; required?: boolean; minSelect?: number; maxSelect?: number; sortOrder?: number; items?: { id?: string; name: string; price?: number; sortOrder?: number; isActive?: boolean }[] },
): Promise<OptionGroupDto> {
  await assertManagerOwnsStore(actor, storeId);

  const existing = await prisma.productOptionGroup.findUnique({
    where: { id: groupId },
    include: { product: { select: { storeId: true, id: true } } },
  });
  if (!existing) throw notFound('مجموعة الخيارات غير موجودة / Option group not found');
  if (existing.product.storeId !== storeId) {
    throw forbidden('غير مصرح / Not authorized');
  }

  // Enforce 5-item total cap when replacing items.
  if (body.items !== undefined) {
    const incomingItemCount = body.items.length;
    const otherGroups = await prisma.productOptionGroup.findMany({
      where: { productId: existing.product.id, id: { not: groupId } },
      include: { items: { select: { id: true } } },
    });
    const otherItemCount = otherGroups.reduce((sum: number, g: any) => sum + g.items.length, 0);
    if (otherItemCount + incomingItemCount > 5) {
      throw unprocessable(
        'MAX_ITEMS_EXCEEDED',
        `الحد الأقصى المسموح به هو 5 إضافات للمنتج الواحد (${otherItemCount} في مجموعات أخرى + ${incomingItemCount} هنا)`,
      );
    }
  }    const group = await prisma.$transaction(async (tx) => {
    // If items array provided, do a full replacement (delete old → create new).
    if (body.items !== undefined) {
      await tx.productOptionItem.deleteMany({ where: { groupId } });
      await tx.productOptionGroup.update({
        where: { id: groupId },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.required !== undefined ? { required: body.required } : {}),
          ...(body.minSelect !== undefined ? { minSelect: body.minSelect } : {}),
          ...(body.maxSelect !== undefined ? { maxSelect: body.maxSelect } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          items: {
            create: body.items.map((item, idx) => ({
              name: item.name.trim(),
              price: item.price ?? 0,
              sortOrder: item.sortOrder ?? idx,
              isActive: item.isActive ?? true,
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    } else {
      // Partial update of group fields only.
      await tx.productOptionGroup.update({
        where: { id: groupId },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.required !== undefined ? { required: body.required } : {}),
          ...(body.minSelect !== undefined ? { minSelect: body.minSelect } : {}),
          ...(body.maxSelect !== undefined ? { maxSelect: body.maxSelect } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        },
      });
    }

    return prisma.productOptionGroup.findUnique({
      where: { id: groupId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  return mapGroup(group!);
}

/**
 * Delete an option group and its items. Cascade handles items.
 */
export async function deleteOptionGroup(
  actor: { sub: string; role: string },
  storeId: string,
  groupId: string,
): Promise<void> {
  await assertManagerOwnsStore(actor, storeId);

  const existing = await prisma.productOptionGroup.findUnique({
    where: { id: groupId },
    include: { product: { select: { storeId: true } } },
  });
  if (!existing) throw notFound('مجموعة الخيارات غير موجودة / Option group not found');
  if (existing.product.storeId !== storeId) {
    throw forbidden('غير مصرح / Not authorized');
  }

  await prisma.productOptionGroup.delete({ where: { id: groupId } });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function assertManagerOwnsStore(
  actor: { sub: string; role: string },
  storeId: string,
): Promise<void> {
  if (actor.role === 'ADMIN') return;
  if (actor.role !== 'STORE_MANAGER') throw forbidden('غير مصرح / Not authorized');
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { managerId: true } });
  if (!store || store.managerId !== actor.sub) {
    throw forbidden('هذا ليس متجرك / This is not your store');
  }
}

function mapGroup(g: any): OptionGroupDto {
  return {
    id: g.id,
    productId: g.productId,
    name: g.name,
    required: g.required,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    sortOrder: g.sortOrder,
    items: (g.items ?? []).map((i: any) => ({
      id: i.id,
      groupId: g.id,
      name: i.name,
      priceDelta: i.price,
      sortOrder: i.sortOrder,
      isActive: i.isActive,
    })),
  };
}
