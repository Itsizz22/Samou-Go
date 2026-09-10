import { env } from '../../config/env';
import { createRoadRouter } from './road-routing';
import { directDistanceMeters, type JwtPayload, type LiveOrderTracking } from '@samou-go/shared-types';
import { getPlatformSettings } from './platform.service';
import { prisma } from '../../lib/prisma';
import { forbidden, notFound } from '../../lib/http-error';
import { isOrderPartyMember } from '../../lib/order-party';
const roadRoute = createRoadRouter(env.osrmBaseUrl);
export async function getTracking(auth: JwtPayload, orderId: string): Promise<LiveOrderTracking> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { store: true, deliveryZone: true } });
  if (!order) throw notFound('الطلب غير موجود / Order not found');
  if (!isOrderPartyMember(auth, order)) throw forbidden();
  const enabled = (await getPlatformSettings()).gpsCaptureEnabled;
  const complete = ['DELIVERED', 'CANCELLED', 'REJECTED'].includes(order.status);
  const stage = complete ? 'complete' : ['PICKED_UP', 'ON_THE_WAY'].includes(order.status) ? 'customer' : 'store';
  const store = order.store.latitude !== null && order.store.longitude !== null ? { lat: order.store.latitude, lng: order.store.longitude, label: order.store.nameAr } : null;
  const destination = stage === 'customer' ? order.latitude !== null && order.longitude !== null ? { lat: order.latitude, lng: order.longitude, label: 'موقع التسليم' } : null : store;
  const row = enabled && !complete && order.captainId ? await prisma.captainLocation.findUnique({ where: { captainId: order.captainId } }) : null;
  const location = row ? { lat: row.lat, lng: row.lng, updatedAt: row.updatedAt.toISOString() } : null;
  const stale = !row || Date.now() - row.updatedAt.getTime() > 60000;
  const route = enabled && !stale && location && destination ? await roadRoute(location, destination) : null;
  return { route, enabled, stage, store, destination, location, stale, address: order.customerAddressText, zone: order.deliveryZone?.nameAr ?? null, distanceMeters: !stale && location && destination ? directDistanceMeters(location, destination) : null, distanceKind: 'straight-line' };
}
