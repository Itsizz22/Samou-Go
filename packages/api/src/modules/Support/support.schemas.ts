import { z } from 'zod';
import { TicketStatus, TicketPriority } from '@samou-go/shared-types';
const status = z.enum([TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CLOSED]);
const priority = z.enum([TicketPriority.LOW, TicketPriority.NORMAL, TicketPriority.HIGH, TicketPriority.URGENT]);
export const createTicketSchema = z.object({
  orderId: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).max(60),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2000).optional(),
  priority: priority.default(TicketPriority.NORMAL),
});
export const createMessageSchema = z.object({ message: z.string().trim().min(1).max(2000), attachments: z.array(z.string().url()).max(5).optional() });
export const updateTicketStatusSchema = z.object({ status, priority: priority.optional() });
export const listTicketSchema = z.object({ status: status.optional(), priority: priority.optional(), category: z.string().trim().max(60).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;
