import { Router } from 'express';
import { TicketStatus, TicketPriority } from '@samou-go/shared-types';
import { asyncHandler } from '../../lib/async-handler';
import { requireAuth } from '../../middleware/authenticate';
import {
  createSupportTicketHandler,
  listSupportTicketsHandler,
  getSupportTicketHandler,
  addSupportMessageHandler,
  updateSupportTicketStatusHandler,
} from './support.controller';

export const supportRouter: Router = Router();

supportRouter.use(requireAuth);

supportRouter.post('/', asyncHandler(createSupportTicketHandler));
supportRouter.get('/', asyncHandler(listSupportTicketsHandler));
supportRouter.get('/:id', asyncHandler(getSupportTicketHandler));
supportRouter.post('/:id/messages', asyncHandler(addSupportMessageHandler));
supportRouter.patch('/:id/status', asyncHandler(updateSupportTicketStatusHandler));
