/**
 * Samou' Go — Support Ticket types.
 *
 * Ticket models, input shapes, and enums shared between API and front-ends.
 * This file mirrors the Prisma schema contracts so front-ends can type safely.
 */

import type { TicketStatus, TicketPriority } from './enums';

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  userId: string;
  orderId?: string;
  category: string;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  messages?: TicketMessage[];
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: 'CUSTOMER' | 'STORE_MANAGER' | 'CAPTAIN' | 'ADMIN' | 'SUPPORT';
  message: string;
  attachments?: string[];
  createdAt: string;
}

export interface CreateTicketInput {
  ticketNumber: string;
  userId: string;
  orderId?: string;
  category: string;
  subject: string;
  priority?: TicketPriority;
  status?: TicketStatus;
}

export interface CreateMessageInput {
  senderId: string;
  senderRole: 'CUSTOMER' | 'STORE_MANAGER' | 'CAPTAIN' | 'ADMIN' | 'SUPPORT';
  message: string;
  attachments?: string[];
}

export interface UpdateTicketStatusInput {
  status?: TicketStatus;
  priority?: TicketPriority;
}