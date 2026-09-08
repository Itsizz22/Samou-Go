import { z } from 'zod';
import { TicketStatus, TicketPriority } from '@samou-go/shared-types';

export const createTicketSchema = z.object({
  ticketNumber: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  orderId: z.string().trim().optional(),
  category: z.string().trim().min(1),
  subject: z.string().trim().min(1).max(200),
  priority: z.enum([TicketPriority.LOW, TicketPriority.NORMAL, TicketPriority.HIGH, TicketPriority.URGENT]),
  status: z.enum([TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CLOSED]).default(TicketStatus.OPEN),
});

export const createMessageSchema = z.object({
  senderId: z.string().trim().min(1),
  senderRole: z.enum(['CUSTOMER', 'STORE_MANAGER', 'CAPTAIN', 'ADMIN', 'SUPPORT']),
  message: z.string().trim().min(1).max(2000),
  attachments: z.array(z.string().url()).optional(),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum([TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CLOSED]),
  priority: z.enum([TicketPriority.LOW, TicketPriority.NORMAL, TicketPriority.HIGH, TicketPriority.URGENT]).optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;