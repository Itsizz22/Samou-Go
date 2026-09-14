import { ok, created } from '../../lib/respond';
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
  ok(res, { items: result });
}

export async function createOptionGroupHandler(req: Request, res: Response) {
  const actor = actorFromReq(req);
  const storeId = req.params.storeId!;
  const productId = req.params.productId!;
  const result = await createOptionGroup(actor, storeId, productId, req.body);
  created(res, result);
}

export async function updateOptionGroupHandler(req: Request, res: Response) {
  const actor = actorFromReq(req);
  const storeId = req.params.storeId!;
  const groupId = req.params.groupId!;
  const result = await updateOptionGroup(actor, storeId, groupId, req.body, req.params.productId!);
  ok(res, result);
}

export async function deleteOptionGroupHandler(req: Request, res: Response) {
  const actor = actorFromReq(req);
  const storeId = req.params.storeId!;
  const groupId = req.params.groupId!;
  await deleteOptionGroup(actor, storeId, groupId, req.params.productId!);
  res.status(204).end();
}

import * as templates from './options.service';
export async function listOptionTemplatesHandler(req: Request, res: Response) {
  const result = await templates.listOptionTemplates(actorFromReq(req), req.params.storeId!);
  ok(res, { items: result });
}
export async function attachOptionTemplateHandler(req: Request, res: Response) {
  const result = await templates.attachOptionTemplate(actorFromReq(req), req.params.storeId!, req.params.productId!, req.body);
  created(res, result);
}
export async function promoteOptionTemplateHandler(req: Request, res: Response) {
  const result = await templates.promoteOptionTemplate(actorFromReq(req), req.params.storeId!, req.params.productId!, req.params.groupId!);
  created(res, result);
}
export async function detachOptionTemplateHandler(req: Request, res: Response) {
  const result = await templates.detachOptionTemplate(actorFromReq(req), req.params.storeId!, req.params.productId!, req.params.groupId!);
  ok(res, result);
}
export async function deleteOptionTemplateHandler(req: Request, res: Response) {
  const result = await templates.deleteOptionTemplate(actorFromReq(req), req.params.storeId!, req.params.templateId!);
  res.status(204).end();
}
