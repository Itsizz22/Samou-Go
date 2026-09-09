import { randomUUID } from 'node:crypto';
import { prisma, caseInsensitiveContains } from '../../lib/prisma';
import { TicketStatus } from '@samou-go/shared-types';
import { createTicketSchema, createMessageSchema, updateTicketStatusSchema, listTicketSchema } from './support.schemas';
import { badRequest, forbidden, notFound } from '../../lib/http-error';
import { parseWith } from '../../lib/validate';
import type { CreateTicketInput, CreateMessageInput, UpdateTicketStatusInput, JwtPayload } from '@samou-go/shared-types';

export async function createTicket(input: CreateTicketInput, auth: JwtPayload) {
  const body = parseWith(createTicketSchema, input);
  if (body.orderId) {
    const order = await prisma.order.findUnique({ where: { id: body.orderId }, select: { customerId: true, captainId: true, store: { select: { managerId: true } } } });
    if (!order || (auth.role !== 'ADMIN' && order.customerId !== auth.sub && order.captainId !== auth.sub && order.store.managerId !== auth.sub)) throw forbidden();
  }
  return prisma.supportTicket.create({ data: {
    ticketNumber: 'TKT-' + randomUUID(), userId: auth.sub, orderId: body.orderId,
    category: body.category, subject: body.subject, priority: body.priority, status: TicketStatus.OPEN,
    messages: { create: { senderId: auth.sub, senderRole: auth.role, message: body.message ?? body.subject } },
  }, include: { messages: true } });
}

export async function listTickets(query: { status?: string; priority?: string; category?: string; page?: number; pageSize?: number } = {}, auth: JwtPayload) {
  const q = parseWith(listTicketSchema, query);
  const where = { ...(q.status && { status: q.status }), ...(q.priority && { priority: q.priority }), ...(q.category && { category: caseInsensitiveContains(q.category) }), ...(auth.role !== 'ADMIN' && { userId: auth.sub }) };
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({ where, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.ceil(total / q.pageSize) };
}

export async function getTicket(id: string, auth: JwtPayload) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'desc' }, take: 200 } } });
  if (!ticket) throw notFound('التذكرة غير موجودة / Support ticket not found');
  if (auth.role !== 'ADMIN' && ticket.userId !== auth.sub) throw forbidden();
  return { ...ticket, messages: [...ticket.messages].reverse() };
}

export async function addMessage(id: string, input: CreateMessageInput, auth: JwtPayload) {
  const body = parseWith(createMessageSchema, input);
  return prisma.$transaction(async tx => {
    const ticket = await tx.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw notFound('التذكرة غير موجودة / Support ticket not found');
    if (ticket.userId !== auth.sub && auth.role !== 'ADMIN') throw forbidden();
    if (ticket.status === TicketStatus.CLOSED) throw badRequest('التذكرة مغلقة، أنشئ تذكرة جديدة / Ticket is closed');
    const message = await tx.ticketMessage.create({ data: { ticketId: id, senderId: auth.sub, senderRole: auth.role, message: body.message, ...(body.attachments && { attachments: body.attachments }) } });
    await tx.supportTicket.update({ where: { id }, data: { updatedAt: new Date() } });
    return message;
  });
}

export async function updateTicketStatus(id: string, input: UpdateTicketStatusInput, auth: JwtPayload) {
  if (auth.role !== 'ADMIN') throw forbidden();
  const body = parseWith(updateTicketStatusSchema, input);
  const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
  if (!ticket) throw notFound('التذكرة غير موجودة / Support ticket not found');
  return prisma.supportTicket.update({ where: { id }, data: { status: body.status, priority: body.priority, resolvedAt: body.status === TicketStatus.RESOLVED || body.status === TicketStatus.CLOSED ? new Date() : null } });
}
