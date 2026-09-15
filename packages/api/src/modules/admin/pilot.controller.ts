import type { Request, Response } from 'express';
import { z } from 'zod';
import { MAX_ACTIVE_CAPTAIN_ORDERS } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { parseWith } from '../../lib/validate';
import { ok } from '../../lib/respond';
import { notFound } from '../../lib/http-error';
import { requireAuth } from '../../middleware/authenticate';
import { getTracking } from '../platform/tracking.service';
import { ACTIVE_CAPTAIN_STATUSES } from '../orders/captain-pool';
import { pilotEvents } from '../../lib/pilot-telemetry';
import { env } from '../../config/env';

/** Mounted only behind the admin router. Explicit allowlists exclude PINs and credentials. */
export async function pilotOrderHandler(req: Request, res: Response) {
  const { orderId } = parseWith(z.object({ orderId: z.string().min(1).max(100) }), req.params);
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: {
    id: true, orderNumber: true, customerId: true, storeId: true, captainId: true, status: true, fulfillmentType: true,
    createdAt: true, updatedAt: true, preparationStartedAt: true, preparedAt: true,
    dispatchCaptainId: true, dispatchExpiresAt: true, latitude: true, longitude: true,
    customerAddressText: true, addressNote: true, deliveryZoneId: true,
    store: { select: { managerId: true, latitude: true, longitude: true } },
    statusHistory: { select: { status: true, createdAt: true, changedByUserId: true }, orderBy: { createdAt: 'asc' }, take: 100 },
  } });
  if (!order) throw notFound('الطلب غير موجود');
  const recipients = [...new Set([order.customerId, order.store.managerId, order.captainId, order.dispatchCaptainId].filter((id): id is string => !!id))];
  const [tracking, notifications, devices, activeOrders] = await Promise.all([
    getTracking(requireAuth(req), orderId),
    prisma.notificationDelivery.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, userId: true, type: true, status: true, sentCount: true, failedCount: true, errorCode: true, providerAcceptedAt: true, openedAt: true, createdAt: true } }),
    prisma.deviceToken.groupBy({ by: ['userId', 'platform'], where: { userId: { in: recipients } }, _count: { _all: true } }),
    order.captainId ? prisma.order.count({ where: { captainId: order.captainId, status: { in: ACTIVE_CAPTAIN_STATUSES } } }) : Promise.resolve(0),
  ]);
  const ageMs = tracking.location ? Date.now() - Date.parse(tracking.location.updatedAt) : null;
  const routeState = !tracking.enabled ? 'GPS_DISABLED' : tracking.stage === 'complete' ? 'NOT_APPLICABLE' : !tracking.destination ? 'DESTINATION_MISSING' : !tracking.location ? 'GPS_MISSING' : tracking.stale ? 'GPS_STALE' : !env.osrmBaseUrl ? 'OSRM_NOT_CONFIGURED' : tracking.route ? 'OK' : 'OSRM_UNAVAILABLE_OR_NO_ROUTE';
  res.setHeader('Cache-Control', 'no-store');
  ok(res, { checkedAt: new Date().toISOString(), order, captainCapacity: { activeOrders, maximum: MAX_ACTIVE_CAPTAIN_ORDERS },
    offer: { captainId: order.dispatchCaptainId, expiresAt: order.dispatchExpiresAt, state: order.captainId ? 'ASSIGNED' : !order.dispatchCaptainId ? 'NONE' : order.dispatchExpiresAt && order.dispatchExpiresAt.getTime() > Date.now() ? 'ACTIVE' : 'EXPIRED' },
    tracking: { ...tracking, ageMs, routeState }, notifications, deviceCounts: devices.map(d => ({ userId: d.userId, platform: d.platform, count: d._count._all })),
    telemetry: pilotEvents(orderId, order.captainId), receiptCaveat: 'Provider acceptance/opened telemetry is not proof of physical notification receipt.' });
}
export async function pilotAccountHandler(req: Request, res: Response) {
  const { phone } = parseWith(z.object({ phone: z.string().regex(/^05[0-9]{8}$/) }), req.query);
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, role: true, isActive: true, isVerified: true, isAvailable: true, passwordHash: true, managedStores: { select: { id: true, isActive: true, isApproved: true } } } });
  res.setHeader('Cache-Control', 'no-store');
  if (!user) { ok(res, { exists: false }); return; }
  const { passwordHash, ...account } = user;
  ok(res, { exists: true, account, passwordState: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash) ? 'BCRYPT_CONFIGURED' : 'INVALID_OR_UNSUPPORTED_HASH', loginEndpoint: '/api/v1/auth/login' });
}
