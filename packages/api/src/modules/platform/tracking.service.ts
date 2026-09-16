import { env } from '../../config/env';
import { createRoadRouter } from './road-routing';
import { directDistanceMeters, type JwtPayload, type LiveOrderTracking } from '@samou-go/shared-types';
import { getPlatformSettings } from './platform.service';
import { prisma } from '../../lib/prisma';
import { forbidden, notFound } from '../../lib/http-error';
import { isOrderPartyMember } from '../../lib/order-party';
const roadRoute = createRoadRouter(env.osrmBaseUrl);
function validPoint(lat: number | null, lng: number | null): boolean {
  return lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
export async function getTracking(auth: JwtPayload, orderId: string): Promise<LiveOrderTracking> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { store: true, deliveryZone: true } });
  if (!order) throw notFound('الطلب غير موجود / Order not found');
  if (!isOrderPartyMember(auth, order)) throw forbidden();
  const enabled = (await getPlatformSettings()).gpsCaptureEnabled;
  const complete = order.fulfillmentType === 'PICKUP' || ['DELIVERED', 'CANCELLED', 'REJECTED'].includes(order.status);
  const stage = complete ? 'complete' : ['PICKED_UP', 'ON_THE_WAY'].includes(order.status) ? 'customer' : 'store';
  const store = order.store.latitude !== null && order.store.longitude !== null && validPoint(order.store.latitude, order.store.longitude) ? { lat: order.store.latitude, lng: order.store.longitude, label: order.store.nameAr } : null;
  const customer = order.latitude !== null && order.longitude !== null && Number.isFinite(order.latitude) && Number.isFinite(order.longitude) && Math.abs(order.latitude) <= 90 && Math.abs(order.longitude) <= 180 ? { lat: order.latitude, lng: order.longitude, label: 'موقع التسليم' } : null;
  const destination = stage === 'customer' ? customer : store;
  const row = enabled && !complete && order.captainId ? await prisma.captainLocation.findUnique({ where: { captainId: order.captainId } }) : null;
  const location = row && validPoint(row.lat, row.lng) ? { lat: row.lat, lng: row.lng, updatedAt: row.updatedAt.toISOString() } : null;
  const age = row ? Date.now() - row.updatedAt.getTime() : Infinity;
  const stale = !location || age < 0 || age > 60000;
  const route = enabled && !stale && location && destination ? await roadRoute(location, destination) : null;
  return { route, enabled, stage, customer, addressNote: order.addressNote, store, destination, location, stale, address: order.customerAddressText, zone: order.deliveryZone?.nameAr ?? null, distanceMeters: !stale && location && destination ? directDistanceMeters(location, destination) : null, distanceKind: 'straight-line' };
}
