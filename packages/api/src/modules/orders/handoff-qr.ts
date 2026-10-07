import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';

type HandoffOrder = { id: string; createdAt: Date; captainId: string | null; status: string; fulfillmentType: string };
export type HandoffStage = 'pickup' | 'delivery';
/** Domain-separated, non-guessable proof. No personal data or authentication credentials. */
export function handoffQrToken(order: HandoffOrder, stage: HandoffStage): string {
  const signature = createHmac('sha256', env.jwt.secret)
    .update(JSON.stringify(['samou-handoff-v1', order.id, order.createdAt.toISOString(), stage, order.captainId]))
    .digest('base64url');
  return `SAMOU:1:${stage}:${order.id}:${signature}`;
}
export function verifyHandoffQr(order: HandoffOrder, stage: HandoffStage, token: string | undefined): boolean {
  if (order.fulfillmentType !== 'DELIVERY' || order.status !== (stage === 'pickup' ? 'READY_FOR_PICKUP' : 'ON_THE_WAY')) return false;
  if (!token || token.length > 300) return false;
  const expected = Buffer.from(handoffQrToken(order, stage));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function visibleHandoffQr(order: HandoffOrder, role?: string): { pickupQr?: string; deliveryQr?: string } {
  if (order.fulfillmentType !== 'DELIVERY') return {};
  if (order.status === 'READY_FOR_PICKUP' && (role === 'STORE_MANAGER' || role === 'ADMIN')) return { pickupQr: handoffQrToken(order, 'pickup') };
  if (order.status === 'ON_THE_WAY' && role === 'CUSTOMER') return { deliveryQr: handoffQrToken(order, 'delivery') };
  return {};
}

/** During rollout, only an omitted proof may use the existing handover path. Invalid supplied proofs always fail. */
export function acceptsHandoffQr(order: HandoffOrder, stage: HandoffStage, token: string | undefined, required: boolean = env.handoffQrRequired): boolean {
  return token === undefined && !required ? true : verifyHandoffQr(order, stage, token);
}
