import type { Prisma } from '../../lib/prisma-types';
import {
  CustomRequestStatus,
  UserRole,
  canTransitionCustomRequestStatus,
  isTerminalCustomRequestStatus,
} from '@samou-go/shared-types';
import type {
  CustomRequestWithCustomer,
  CustomRequestWithStore,
  Paginated,
} from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { badState, forbidden, notFound } from '../../lib/http-error';
import { decimalToNumber } from '../../lib/decimal';
import type {
  CreateCustomRequestBody,
  CustomRequestListQuery,
  OfferCustomRequestBody,
  RespondCustomRequestBody,
} from './custom-requests.schemas';

const CUSTOMER_INCLUDE = {
  store: { select: { id: true, nameAr: true, nameEn: true, logoUrl: true } },
} satisfies Prisma.CustomRequestInclude;

const STORE_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.CustomRequestInclude;

type CustomerRow = Prisma.CustomRequestGetPayload<{ include: typeof CUSTOMER_INCLUDE }>;
type StoreRow = Prisma.CustomRequestGetPayload<{ include: typeof STORE_INCLUDE }>;

function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

function toCustomerRow(row: CustomerRow): CustomRequestWithStore {
  return {
    id: row.id,
    customerId: row.customerId,
    storeId: row.storeId,
    description: row.description,
    imageUrl: row.imageUrl ?? null,
    status: row.status,
    offeredPrice: row.offeredPrice === null ? null : decimalToNumber(row.offeredPrice),
    offerNote: row.offerNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    store: row.store,
  };
}

function toStoreRow(row: StoreRow): CustomRequestWithCustomer {
  return {
    id: row.id,
    customerId: row.customerId,
    storeId: row.storeId,
    description: row.description,
    imageUrl: row.imageUrl ?? null,
    status: row.status,
    offeredPrice: row.offeredPrice === null ? null : decimalToNumber(row.offeredPrice),
    offerNote: row.offerNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    customer: row.customer,
  };
}

/** The stores a STORE_MANAGER manages. */
async function storeIdsManagedBy(userId: string): Promise<string[]> {
  const stores = await prisma.store.findMany({ where: { managerId: userId }, select: { id: true } });
  return stores.map(store => store.id);
}

/** Throws 403 when the caller may not act on the store's requests. */
async function assertStoreAccess(
  actor: { sub: string; role: UserRole },
  storeId: string
): Promise<void> {
  if (actor.role === UserRole.ADMIN) return;
  if (actor.role !== UserRole.STORE_MANAGER) {
    throw forbidden('لا تملك صلاحية لهذا الإجراء / You are not allowed to perform this action');
  }
  const managed = await storeIdsManagedBy(actor.sub);
  if (!managed.includes(storeId)) {
    throw forbidden('هذا المتجر لا يخصّك / This store does not belong to you');
  }
}

/**
 * POST /customer/custom-requests — a customer asks a store for something that
 * is not on the menu. Fulfilment is manual, so there is no order/delivery
 * coupling. Only live, approved stores (the public catalogue) can be asked.
 */
export async function createCustomRequest(
  customerId: string,
  body: CreateCustomRequestBody
): Promise<CustomRequestWithStore> {
  const store = await prisma.store.findUnique({
    where: { id: body.storeId },
    select: { isActive: true, isApproved: true },
  });
  if (!store || !store.isActive || !store.isApproved) {
    throw notFound('المتجر غير موجود / Store not found');
  }

  const request = await prisma.customRequest.create({
    data: {
      customerId,
      storeId: body.storeId,
      description: body.description,
      imageUrl: body.imageUrl ?? null,
      status: CustomRequestStatus.PENDING,
    },
    include: CUSTOMER_INCLUDE,
  });
  return toCustomerRow(request);
}

/** GET /customer/custom-requests — the customer's own requests. */
export async function listCustomerRequests(
  customerId: string,
  query: CustomRequestListQuery
): Promise<Paginated<CustomRequestWithStore>> {
  const where: Prisma.CustomRequestWhereInput = {
    customerId,
    ...(query.status ? { status: query.status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.customRequest.findMany({
      where,
      include: CUSTOMER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.customRequest.count({ where }),
  ]);
  return paginate(rows.map(toCustomerRow), total, query.page, query.pageSize);
}

/** PATCH /customer/custom-requests/:id/respond — accept or reject a quote. */
export async function respondToCustomRequest(
  customerId: string,
  requestId: string,
  body: RespondCustomRequestBody
): Promise<CustomRequestWithStore> {
  const request = await prisma.customRequest.findUnique({
    where: { id: requestId },
    include: CUSTOMER_INCLUDE,
  });
  if (!request) throw notFound('الطلب المخصص غير موجود / Request not found');
  if (request.customerId !== customerId) {
    throw forbidden('هذا الطلب ليس لك / This request is not yours');
  }
  if (request.status !== CustomRequestStatus.PRICE_OFFERED) {
    throw badState(
      'REQUEST_NOT_OFFERED',
      'لا يمكن الرد قبل عرض السعر / Cannot respond before the store quotes a price'
    );
  }

  const next =
    body.action === 'ACCEPT' ? CustomRequestStatus.ACCEPTED : CustomRequestStatus.REJECTED;
  if (!canTransitionCustomRequestStatus(request.status, next)) {
    throw badState('ILLEGAL_TRANSITION', 'انتقال غير صالح / Illegal transition');
  }

  const updated = await prisma.customRequest.update({
    where: { id: requestId },
    data: { status: next },
    include: CUSTOMER_INCLUDE,
  });
  return toCustomerRow(updated);
}

/** POST /customer/custom-requests/:id/cancel — pull a request while still open. */
export async function cancelCustomerRequest(
  customerId: string,
  requestId: string
): Promise<CustomRequestWithStore> {
  const request = await prisma.customRequest.findUnique({ where: { id: requestId } });
  if (!request) throw notFound('الطلب المخصص غير موجود / Request not found');
  if (request.customerId !== customerId) {
    throw forbidden('هذا الطلب ليس لك / This request is not yours');
  }

  await moveToCancelled(request.status, requestId);
  const row = await prisma.customRequest.findUnique({
    where: { id: requestId },
    include: CUSTOMER_INCLUDE,
  });
  return toCustomerRow(row!);
}

/** GET /store/custom-requests — everything aimed at the manager's stores. */
export async function listStoreRequests(
  managerId: string,
  role: UserRole,
  query: CustomRequestListQuery
): Promise<Paginated<CustomRequestWithCustomer>> {
  const managed = role === UserRole.ADMIN ? undefined : await storeIdsManagedBy(managerId);
  if (managed !== undefined && managed.length === 0) {
    return paginate([], 0, query.page, query.pageSize);
  }

  const where: Prisma.CustomRequestWhereInput = {
    ...(managed !== undefined ? { storeId: { in: managed } } : {}),
    ...(query.storeId ? { storeId: query.storeId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.customRequest.findMany({
      where,
      include: STORE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.customRequest.count({ where }),
  ]);
  return paginate(rows.map(toStoreRow), total, query.page, query.pageSize);
}

/** POST /store/custom-requests/:id/offer — quote a price on a PENDING request. */
export async function offerPriceOnCustomRequest(
  actor: { sub: string; role: UserRole },
  requestId: string,
  body: OfferCustomRequestBody
): Promise<CustomRequestWithCustomer> {
  const request = await prisma.customRequest.findUnique({ where: { id: requestId } });
  if (!request) throw notFound('الطلب المخصص غير موجود / Request not found');
  await assertStoreAccess(actor, request.storeId);

  if (request.status !== CustomRequestStatus.PENDING) {
    throw badState(
      'REQUEST_NOT_PENDING',
      'لا يمكن عرض سعر على طلب تم الرد عليه / Only pending requests can be quoted'
    );
  }
  if (!canTransitionCustomRequestStatus(request.status, CustomRequestStatus.PRICE_OFFERED)) {
    throw badState('ILLEGAL_TRANSITION', 'انتقال غير صالح / Illegal transition');
  }

  const updated = await prisma.customRequest.update({
    where: { id: requestId },
    data: {
      status: CustomRequestStatus.PRICE_OFFERED,
      offeredPrice: body.offeredPrice,
      offerNote: body.offerNote ?? null,
    },
    include: STORE_INCLUDE,
  });
  return toStoreRow(updated);
}

/** POST /store/custom-requests/:id/cancel — withdraw an open request or offer. */
export async function cancelStoreRequest(
  actor: { sub: string; role: UserRole },
  requestId: string
): Promise<CustomRequestWithCustomer> {
  const request = await prisma.customRequest.findUnique({ where: { id: requestId } });
  if (!request) throw notFound('الطلب المخصص غير موجود / Request not found');
  await assertStoreAccess(actor, request.storeId);

  await moveToCancelled(request.status, requestId);
  const row = await prisma.customRequest.findUnique({
    where: { id: requestId },
    include: STORE_INCLUDE,
  });
  return toStoreRow(row!);
}

/** Shared CANCELLED path — the request must still be open (PENDING/PRICE_OFFERED). */
async function moveToCancelled(
  current: CustomRequestStatus,
  requestId: string
): Promise<void> {
  if (isTerminalCustomRequestStatus(current)) {
    throw badState(
      'REQUEST_CLOSED',
      'الطلب المخصص مغلق ولا يمكن إلغاؤه / Request is closed and cannot be cancelled'
    );
  }
  if (!canTransitionCustomRequestStatus(current, CustomRequestStatus.CANCELLED)) {
    throw badState('ILLEGAL_TRANSITION', 'انتقال غير صالح / Illegal transition');
  }
  await prisma.customRequest.update({
    where: { id: requestId },
    data: { status: CustomRequestStatus.CANCELLED },
  });
}