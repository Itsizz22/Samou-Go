import { UserRole } from '@samou-go/shared-types';

/** The order shape the chat party check needs. */
export interface OrderPartyLookup {
  customerId: string;
  captainId: string | null;
  store: { managerId: string };
}

/**
 * The single rule for who may talk about an order: the customer, the assigned
 * captain, the store manager — or an admin. Shared by the REST chat endpoints
 * (`platform.service.ts`) and the Socket.IO chat handler
 * (`realtime-handlers.ts`) so the two live update paths can never drift.
 */
export function isOrderPartyMember(
  auth: { sub: string; role: UserRole },
  order: OrderPartyLookup
): boolean {
  return (
    auth.role === UserRole.ADMIN ||
    [order.customerId, order.captainId, order.store.managerId].includes(auth.sub)
  );
}
