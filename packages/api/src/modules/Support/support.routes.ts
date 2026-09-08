import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate } from '../../middleware/authenticate';
import {
  createSupportTicketHandler,
  listSupportTicketsHandler,
  getSupportTicketHandler,
  addSupportMessageHandler,
  updateSupportTicketStatusHandler,
} from './support.controller';

export const supportRouter: Router = Router();

supportRouter.use(authenticate);

supportRouter.post('/', asyncHandler(createSupportTicketHandler));
supportRouter.get('/', asyncHandler(listSupportTicketsHandler));
supportRouter.get('/:id', asyncHandler(getSupportTicketHandler));
supportRouter.post('/:id/messages', asyncHandler(addSupportMessageHandler));
supportRouter.patch('/:id/status', asyncHandler(updateSupportTicketStatusHandler));
