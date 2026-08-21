import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate } from '../../middleware/authenticate';
import * as controller from './devices.controller';

export const devicesRouter: Router = Router();

devicesRouter.use(authenticate);

devicesRouter.post(
  '/token',
  asyncHandler(controller.registerTokenHandler)
);

devicesRouter.delete(
  '/token',
  asyncHandler(controller.unregisterTokenHandler)
);
