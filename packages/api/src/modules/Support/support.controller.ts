import type { Request, Response } from 'express';
import { ok, created } from '../../lib/respond';
import { parseWith } from '../../lib/validate';
import { requireAuth } from '../../middleware/authenticate';
import {
  listTicketSchema,
  createTicketSchema,
  createMessageSchema,
  updateTicketStatusSchema,
} from './support.schemas';
import * as supportService from './support.service';
import type { JwtPayload } from '@samou-go/shared-types';

export async function createSupportTicketHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const body = parseWith(createTicketSchema, req.body);
  created(res, await supportService.createTicket(body, auth));
}

export async function listSupportTicketsHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const query = parseWith(listTicketSchema, req.query);
  ok(res, await supportService.listTickets(query, auth));
}

export async function getSupportTicketHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const id = req.params.id ?? '';
  ok(res, await supportService.getTicket(id, auth));
}

export async function addSupportMessageHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const id = req.params.id ?? '';
  const body = parseWith(createMessageSchema, req.body);
  ok(res, await supportService.addMessage(id, body, auth));
}

export async function updateSupportTicketStatusHandler(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const id = req.params.id ?? '';
  const body = parseWith(updateTicketStatusSchema, req.body);
  ok(res, await supportService.updateTicketStatus(id, body, auth));
}
