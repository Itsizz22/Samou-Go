import type { Request, Response } from 'express';
import { requireAuth } from '../../middleware/authenticate';
import { listOptionGroups, createOptionGroup, updateOptionGroup, deleteOptionGroup } from './options.service';

function actorFromReq(req: Request) {
  return requireAuth(req);
}

export async function listOptionGroupsHandler(req: Request, res: Response) {
  const actor = actorFromReq(req);
  const storeId = req.params.storeId!;
  const productId = req.params.productId!;
  const result = await listOptionGroups(actor, storeId, productId);
  res.json({ items: result });
}

export async function createOptionGroupHandler(req: Request, res: Response) {
  const actor = actorFromReq(req);
  const storeId = req.params.storeId!;
  const productId = req.params.productId!;
  const result = await createOptionGroup(actor, storeId, productId, req.body);
  res.status(201).json(result);
}

export async function updateOptionGroupHandler(req: Request, res: Response) {
  const actor = actorFromReq(req);
  const storeId = req.params.storeId!;
  const groupId = req.params.groupId!;
  const result = await updateOptionGroup(actor, storeId, groupId, req.body);
  res.json(result);
}

export async function deleteOptionGroupHandler(req: Request, res: Response) {
  const actor = actorFromReq(req);
  const storeId = req.params.storeId!;
  const groupId = req.params.groupId!;
  await deleteOptionGroup(actor, storeId, groupId);
  res.status(204).end();
}
