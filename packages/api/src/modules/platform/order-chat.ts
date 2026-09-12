import { z } from 'zod';
import type { UserRole } from '@samou-go/shared-types';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, tooMany } from '../../lib/http-error';
import { parseWith } from '../../lib/validate';
import { sendPushToUser } from '../../lib/push';

type Auth = { sub: string; role: UserRole };
export const chatSendSchema = z.object({ recipientId: z.string().min(1).max(100), clientMessageId: z.string().uuid(), message: z.string().trim().min(1).max(2000) }).strict();
export const chatQuerySchema = z.object({ peerId: z.string().min(1).max(100), before: z.string().min(1).max(100).optional() }).strict();
export const chatReadSchema = z.object({ peerId: z.string().min(1).max(100), messageId: z.string().min(1).max(100) }).strict();
async function party(orderId: string, auth: Auth) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: {
    status: true, orderNumber: true, customerId: true, captainId: true,
    customer: { select: { id: true, name: true } },
    captain: { select: { id: true, name: true } },
    store: { select: { managerId: true, nameAr: true } },
  } });
  if (!order || ![order.customerId, order.captainId, order.store.managerId].includes(auth.sub)) throw forbidden();
  const participants = [
    { id: order.customer.id, name: order.customer.name, role: 'CUSTOMER' },
    { id: order.store.managerId, name: order.store.nameAr, role: 'STORE_MANAGER' },
    ...(order.captain ? [{ id: order.captain.id, name: order.captain.name, role: 'CAPTAIN' }] : []),
  ];
  return { order, participants: participants.filter((p, i, all) => p.id !== auth.sub && all.findIndex(x => x.id === p.id) === i) };
}
function requirePeer(peers: { id: string }[], id: string) { if (!peers.some(p => p.id === id)) throw forbidden(); }
export async function chatOverview(orderId: string, auth: Auth) {
  const { order, participants } = await party(orderId, auth);
  const counts = await prisma.chatMessage.groupBy({ by: ['senderId'], where: { orderId, recipientId: auth.sub, readAt: null, senderId: { in: participants.map(p => p.id) } }, _count: { _all: true } });
  return { closed: ['DELIVERED', 'CANCELLED'].includes(order.status), peers: participants.map(p => ({ ...p, unread: counts.find(c => c.senderId === p.id)?._count._all ?? 0 })) };
}
export async function readChat(orderId: string, auth: Auth, raw: unknown) {
  const query = parseWith(chatQuerySchema, raw);
  const { participants } = await party(orderId, auth); requirePeer(participants, query.peerId);
  const where = { orderId, OR: [{ senderId: auth.sub, recipientId: query.peerId }, { senderId: query.peerId, recipientId: auth.sub }] };
  const cursor = query.before ? await prisma.chatMessage.findFirst({ where: { ...where, id: query.before } }) : null;
  if (query.before && !cursor) throw badRequest('صفحة الرسائل غير صالحة');
  const rows = await prisma.chatMessage.findMany({ where: { ...where, ...(cursor ? { AND: [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51 });
  const hasMore = rows.length > 50;
  const selected = rows.slice(0, 50);
  return { items: selected.reverse(), nextBefore: hasMore ? selected[0]?.id ?? null : null };
}
export async function markChatRead(orderId: string, auth: Auth, raw: unknown) {
  const body = parseWith(chatReadSchema, raw);
  const { participants } = await party(orderId, auth); requirePeer(participants, body.peerId);
  const last = await prisma.chatMessage.findFirst({ where: { id: body.messageId, orderId, senderId: body.peerId, recipientId: auth.sub } });
  if (!last) throw badRequest('الرسالة غير موجودة في هذه المحادثة');
  await prisma.chatMessage.updateMany({ where: { orderId, senderId: body.peerId, recipientId: auth.sub, readAt: null, OR: [{ createdAt: { lt: last.createdAt } }, { createdAt: last.createdAt, id: { lte: last.id } }] }, data: { readAt: new Date() } });
  return { read: true };
}
export async function writeChat(orderId: string, auth: Auth, raw: unknown) {
  const body = parseWith(chatSendSchema, raw);
  const { order, participants } = await party(orderId, auth); requirePeer(participants, body.recipientId);
  const existing = await prisma.chatMessage.findUnique({ where: { senderId_clientMessageId: { senderId: auth.sub, clientMessageId: body.clientMessageId } } });
  if (existing) {
    if (existing.orderId !== orderId || existing.recipientId !== body.recipientId || existing.message !== body.message) throw conflict('معرّف إرسال مستخدم لرسالة أخرى');
    return existing;
  }
  if (['DELIVERED', 'CANCELLED'].includes(order.status)) throw badRequest('انتهى الطلب؛ المحادثة متاحة للقراءة فقط');
  if (await prisma.chatMessage.count({ where: { senderId: auth.sub, createdAt: { gte: new Date(Date.now() - 60000) } } }) >= 30) throw tooMany('CHAT_LIMIT', 'انتظر قليلًا قبل إرسال المزيد', 60);
  let row;
  try { row = await prisma.chatMessage.create({ data: { orderId, senderId: auth.sub, senderRole: auth.role, ...body } }); }
  catch (e) {
    // Concurrent retries may race on the unique key; return only the identical write.
    const retry = await prisma.chatMessage.findUnique({ where: { senderId_clientMessageId: { senderId: auth.sub, clientMessageId: body.clientMessageId } } });
    if (!retry || retry.orderId !== orderId || retry.recipientId !== body.recipientId || retry.message !== body.message) throw e;
    return retry;
  }
  void sendPushToUser(body.recipientId, { title: 'رسالة جديدة — Samou Quick', body: `لديك رسالة بخصوص الطلب ${order.orderNumber}`, data: { type: 'CHAT_MESSAGE', orderId, senderId: auth.sub, path: `/orders/${orderId}?chat=1&peer=${encodeURIComponent(auth.sub)}`, messageId: row.id } }).catch(() => {});
  return row;
}
