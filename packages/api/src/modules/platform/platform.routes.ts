import { Router } from 'express';
import { z } from 'zod';
import { LedgerEntryType, SettlementMethod, UserRole } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { created, ok } from '../../lib/respond';
import { badRequest, forbidden, notFound } from '../../lib/http-error';
import { authenticate, authorize, requireAuth } from '../../middleware/authenticate';
import { prisma } from '../../lib/prisma';
import { decimalToNumber } from '../../lib/decimal';

const locationSchema = z.object({ lat: z.number().finite(), lng: z.number().finite(), heading: z.number().finite().optional() });
const ratingSchema = z.object({ storeRating: z.number().int().min(1).max(5), captainRating: z.number().int().min(1).max(5).optional(), comment: z.string().max(1000).optional() });
const chatSchema = z.object({ message: z.string().trim().min(1).max(2000) });
const ticketSchema = z.object({ subject: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(4000) });
const settlementMethodSchema = z.enum(
  Object.values(SettlementMethod) as [SettlementMethod, ...SettlementMethod[]]
);
const settlementSchema = z.object({ amount: z.number().positive(), method: settlementMethodSchema, note: z.string().max(500).optional() });

export const platformRouter: Router = Router();
platformRouter.use(authenticate);

platformRouter.put('/captains/me/location', authorize(UserRole.CAPTAIN), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const body = locationSchema.parse(req.body);
  const location = await prisma.captainLocation.upsert({ where: { captainId: auth.sub }, create: { captainId: auth.sub, ...body }, update: body });
  ok(res, location);
}));

platformRouter.get('/orders/:orderId/location', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, select: { captainId: true, customerId: true, storeId: true } });
  if (!order) throw notFound('الطلب غير موجود / Order not found');
  const auth = requireAuth(req);
  if (auth.role !== UserRole.ADMIN && auth.sub !== order.customerId && auth.sub !== order.captainId) throw forbidden();
  const location = order.captainId ? await prisma.captainLocation.findUnique({ where: { captainId: order.captainId } }) : null;
  ok(res, location);
}));

platformRouter.post('/orders/:orderId/rating', authorize(UserRole.CUSTOMER), asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const orderId = z.string().min(1).parse(req.params.orderId);
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true, storeId: true, captainId: true, status: true } });
  if (!order || order.customerId !== auth.sub) throw notFound('الطلب غير موجود / Order not found');
  if (order.status !== 'DELIVERED') throw badRequest('يمكن التقييم بعد التسليم فقط / Rating is available after delivery');
  const body = ratingSchema.parse(req.body);
  const rating = await prisma.rating.create({ data: { orderId, customerId: auth.sub, storeId: order.storeId, captainId: order.captainId, ...body } });
  created(res, rating);
}));

platformRouter.get('/orders/:orderId/chat', asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, select: { customerId: true, captainId: true, storeId: true, store: { select: { managerId: true } } } });
  if (!order || (auth.role !== UserRole.ADMIN && ![order.customerId, order.captainId, order.store.managerId].includes(auth.sub))) throw forbidden();
  const messages = await prisma.chatMessage.findMany({ where: { orderId: req.params.orderId }, orderBy: { createdAt: 'asc' }, take: 200 });
  ok(res, messages);
}));

platformRouter.post('/orders/:orderId/chat', asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const orderId = z.string().min(1).parse(req.params.orderId);
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true, captainId: true, store: { select: { managerId: true } } } });
  if (!order || (auth.role !== UserRole.ADMIN && ![order.customerId, order.captainId, order.store.managerId].includes(auth.sub))) throw forbidden();
  const body = chatSchema.parse(req.body);
  created(res, await prisma.chatMessage.create({ data: { orderId, senderId: auth.sub, senderRole: auth.role, message: body.message } }));
}));

platformRouter.post('/support/tickets', asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  created(res, await prisma.supportTicket.create({ data: { userId: auth.sub, role: auth.role, ...ticketSchema.parse(req.body) } }));
}));

platformRouter.get('/wallet', asyncHandler(async (req, res) => {
  const auth = requireAuth(req);
  const wallet = await prisma.wallet.findFirst({ where: auth.role === UserRole.STORE_MANAGER ? { store: { managerId: auth.sub } } : { userId: auth.sub }, include: { settlements: { orderBy: { createdAt: 'desc' }, take: 20 } } });
  ok(res, wallet ? { ...wallet, balance: decimalToNumber(wallet.balance), settlements: wallet.settlements.map((s) => ({ ...s, amount: decimalToNumber(s.amount) })) } : null);
}));

platformRouter.get('/admin/financials', authorize(UserRole.ADMIN), asyncHandler(async (_req, res) => {
  const [wallets, settlements, orders] = await Promise.all([
    prisma.wallet.findMany({ include: { user: { select: { id: true, name: true, role: true } }, store: { select: { id: true, nameAr: true } } } }),
    prisma.settlement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.order.aggregate({ _sum: { totalAmount: true }, where: { status: 'DELIVERED' } }),
  ]);
  ok(res, { revenue: decimalToNumber(orders._sum.totalAmount ?? 0), wallets: wallets.map((w) => ({ ...w, balance: decimalToNumber(w.balance) })), settlements: settlements.map((s) => ({ ...s, amount: decimalToNumber(s.amount) })) });
}));

platformRouter.post('/admin/wallets/:walletId/settle', authorize(UserRole.ADMIN), asyncHandler(async (req, res) => {
  const wallet = await prisma.wallet.findUnique({ where: { id: req.params.walletId } });
  if (!wallet) throw notFound('المحفظة غير موجودة / Wallet not found');
  const body = settlementSchema.parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    // Atomic guard: decrement only if the balance can cover the amount. The
    // `updateMany` filter does the check and the write in one statement, so two
    // concurrent settlements can never both pass a read-then-write balance check
    // and push the balance negative.
    const claimed = await tx.wallet.updateMany({
      where: { id: wallet.id, balance: { gte: body.amount } },
      data: { balance: { decrement: body.amount } },
    });
    if (claimed.count === 0) {
      throw badRequest('الرصيد غير كافٍ / Insufficient wallet balance');
    }
    const updated = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    const settlement = await tx.settlement.create({ data: { walletId: wallet.id, amount: body.amount, method: body.method, note: body.note } });
    await tx.ledgerEntry.create({ data: { walletId: wallet.id, amount: -body.amount, type: LedgerEntryType.SETTLEMENT, description: body.note ?? 'Admin settlement' } });
    return { updated, settlement };
  });
  ok(res, { balance: decimalToNumber(result.updated.balance), settlement: { ...result.settlement, amount: decimalToNumber(result.settlement.amount) } });
}));
