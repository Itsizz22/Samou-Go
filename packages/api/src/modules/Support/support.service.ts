import { prisma } from '../../lib/prisma';
import { caseInsensitiveContains } from '../../lib/prisma';
import { TicketStatus, TicketPriority } from '@samou-go/shared-types';
import { createTicketSchema, createMessageSchema, updateTicketStatusSchema } from './support.schemas';
import { badRequest, forbidden, notFound } from '../../lib/http-error';
import { parseWith } from '../../lib/validate';
import type { CreateTicketInput, CreateMessageInput, UpdateTicketStatusInput, JwtPayload } from '@samou-go/shared-types';

export async function createTicket(input: CreateTicketInput, auth: JwtPayload) {
  const body = parseWith(createTicketSchema, input);

  const ticketNumber = await generateTicketNumber();
  const { ticketNumber: _ignoredTicketNumber, userId: _ignoredUserId, ...ticketBody } = body;

  const ticket = await prisma.supportTicket.create({
    data: {
      ticketNumber,
      userId: auth.sub,
      ...ticketBody,
    },
  });

  // Create the initial message from the ticket creator
  await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      senderId: auth.sub,
      senderRole: auth.role,
      message: body.subject,
    },
  });

  return ticket;
}

export async function listTickets(
  query: { status?: string; priority?: string; category?: string } = {},
  auth: JwtPayload
) {
  const where = {
    ...(query.status && { status: query.status }),
    ...(query.priority && { priority: query.priority }),
    ...(query.category && { category: caseInsensitiveContains(query.category) }),
    ...(auth.role !== 'ADMIN' && { userId: auth.sub }),
  };

  return prisma.supportTicket.findMany({
    where,
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 50,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTicket(id: string, auth: JwtPayload) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 200,
      },
    },
  });

  if (!ticket) throw notFound('التذكرة غير الموجودة / Support ticket not found');

  // Admins can view any ticket; users can only view their own unless they're support
  if (auth.role !== 'ADMIN' && ticket.userId !== auth.sub) throw forbidden();

  return ticket;
}

export async function addMessage(id: string, input: CreateMessageInput, auth: JwtPayload) {
  const body = parseWith(createMessageSchema, input);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
  });

  if (!ticket) throw notFound('التذكرة غير موجودة / Support ticket not found');

  // Check permissions: author or admin or support
  if (ticket.userId !== auth.sub && auth.role !== 'ADMIN') {
    throw forbidden();
  }

  const message = await prisma.ticketMessage.create({
    data: {
      ticketId: id,
      senderId: auth.sub,
      senderRole: auth.role,
      message: body.message,
      attachments: body.attachments,
    },
  });

  return message;
}

export async function updateTicketStatus(id: string, input: UpdateTicketStatusInput, auth: JwtPayload) {
  const body = parseWith(updateTicketStatusSchema, input);

  // Only admin and support can update status/priority
  if (auth.role !== 'ADMIN') {
    throw forbidden();
  }

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: {
      status: body.status,
      priority: body.priority,
    },
  });

  return ticket;
}

async function generateTicketNumber(): Promise<string> {
  const lastTicket = await prisma.supportTicket.findFirst({
    orderBy: { ticketNumber: 'desc' },
    select: { ticketNumber: true },
  });

  if (!lastTicket) return 'TKT-1001';

  const match = lastTicket.ticketNumber.match(/TKT-(\d+)/);
  if (!match) return 'TKT-1001';

  const lastNum = parseInt(match[1] ?? '1000', 10);
  return `TKT-${String(lastNum + 1).padStart(4, '0')}`;
}
