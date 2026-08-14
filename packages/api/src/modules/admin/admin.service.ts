import type { Prisma } from '../../lib/prisma-types';
import {
  OrderStatus,
  TERMINAL_ORDER_STATUSES,
  UserRole,
} from '@samou-go/shared-types';
import type { AdminStats } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { decimalToNumber } from '../../lib/decimal';
import { startOfDay } from '../../lib/order-number';
import { toOrderSummary } from '../orders/orders.mapper';
import { SUMMARY_INCLUDE } from '../orders/orders.service';

function sum(value: { _sum: { totalAmount?: Prisma.Decimal | null } } | null): number {
  return value?._sum?.totalAmount ? decimalToNumber(value._sum.totalAmount) : 0;
}

/**
 * GET /api/v1/admin/stats
 *
 * One aggregate for the whole dashboard. All of these could be built from the
 * existing list endpoints, but that would cost the admin screen six round-trips
 * just to render four numbers — this is a single one.
 */
export async function getAdminStats(): Promise<AdminStats> {
  const terminal = [...TERMINAL_ORDER_STATUSES];
  const today = startOfDay(new Date());

  const [revenue, revenueToday, orderCount, activeOrderCount, ordersByStatus] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { status: { notIn: terminal } },
    }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { status: { notIn: terminal }, createdAt: { gte: today } },
    }),
    prisma.order.count(),
    prisma.order.count({ where: { status: { notIn: terminal } } }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const [captains, captainsOnline, captainsVerified, stores, storesActive, storesPending, users] =
    await Promise.all([
      prisma.user.count({ where: { role: UserRole.CAPTAIN } }),
      prisma.user.count({ where: { role: UserRole.CAPTAIN, isActive: true, isAvailable: true } }),
      prisma.user.count({ where: { role: UserRole.CAPTAIN, isVerified: true } }),
      prisma.store.count(),
      prisma.store.count({ where: { isActive: true, isApproved: true } }),
      prisma.store.count({ where: { isApproved: false } }),
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);

  const recentOrders = await prisma.order.findMany({
    include: SUMMARY_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const byStatus: Record<OrderStatus, number> = {
    [OrderStatus.PENDING]: 0,
    [OrderStatus.ACCEPTED]: 0,
    [OrderStatus.PREPARING]: 0,
    [OrderStatus.READY_FOR_PICKUP]: 0,
    [OrderStatus.ON_THE_WAY]: 0,
    [OrderStatus.DELIVERED]: 0,
    [OrderStatus.CANCELLED]: 0,
  };
  for (const row of ordersByStatus) byStatus[row.status] = row._count._all;

  const byRole: Record<UserRole, number> = {
    [UserRole.CUSTOMER]: 0,
    [UserRole.STORE_MANAGER]: 0,
    [UserRole.CAPTAIN]: 0,
    [UserRole.ADMIN]: 0,
  };
  for (const row of users) byRole[row.role] = row._count._all;

  return {
    revenue: {
      total: sum(revenue),
      today: sum(revenueToday),
    },
    orders: {
      total: orderCount,
      active: activeOrderCount,
      byStatus,
    },
    captains: {
      total: captains,
      online: captainsOnline,
      verified: captainsVerified,
    },
    stores: {
      total: stores,
      active: storesActive,
      pendingApproval: storesPending,
    },
    users: {
      total: users.reduce((acc, row) => acc + row._count._all, 0),
      byRole,
    },
    recentOrders: recentOrders.map(toOrderSummary),
  };
}
