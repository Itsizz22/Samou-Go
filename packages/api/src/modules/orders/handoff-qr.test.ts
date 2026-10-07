import { describe, expect, it } from 'vitest';
import { acceptsHandoffQr, handoffQrToken, verifyHandoffQr, visibleHandoffQr } from './handoff-qr';
const order = { id: 'qr-order', createdAt: new Date('2026-10-07T09:00:00Z'), captainId: 'captain', fulfillmentType: 'DELIVERY', status: 'READY_FOR_PICKUP' };
describe('handoff QR proof', () => {
  it('requires the current order, stage and captain; rejects missing, altered and replayed codes', () => {
    const token = handoffQrToken(order, 'pickup');
    expect(verifyHandoffQr(order, 'pickup', token)).toBe(true);
    for (const invalid of [undefined, '1234', token + 'x', token.replace('qr-order', 'other')]) expect(verifyHandoffQr(order, 'pickup', invalid)).toBe(false);
    expect(verifyHandoffQr({ ...order, captainId: 'other' }, 'pickup', token)).toBe(false);
    expect(verifyHandoffQr({ ...order, status: 'ON_THE_WAY' }, 'pickup', token)).toBe(false);
    expect(verifyHandoffQr({ ...order, status: 'ON_THE_WAY' }, 'delivery', token)).toBe(false);
    expect(verifyHandoffQr({ ...order, status: 'CANCELLED' }, 'pickup', token)).toBe(false);
    expect(verifyHandoffQr({ ...order, fulfillmentType: 'PICKUP' }, 'pickup', token)).toBe(false);
  });
  it('exposes the proof only to the handover party, never to the scanning captain', () => {
    expect(visibleHandoffQr(order, 'STORE_MANAGER').pickupQr).toBeTruthy();
    expect(visibleHandoffQr(order, 'CAPTAIN')).toEqual({});
    expect(visibleHandoffQr(order, 'CUSTOMER')).toEqual({});
    const delivery = { ...order, status: 'ON_THE_WAY' };
    expect(visibleHandoffQr(delivery, 'CUSTOMER').deliveryQr).toBeTruthy();
    expect(visibleHandoffQr(delivery, 'STORE_MANAGER')).toEqual({});
    expect(visibleHandoffQr(delivery, 'CAPTAIN')).toEqual({});
  });
});

it('stages enforcement without allowing invalid supplied QR proofs', () => {
 expect(acceptsHandoffQr(order, 'pickup', undefined, false)).toBe(true);
 expect(acceptsHandoffQr(order, 'pickup', undefined, true)).toBe(false);
 for (const required of [true, false]) {
  expect(acceptsHandoffQr(order, 'pickup', 'invalid', required)).toBe(false);
  expect(acceptsHandoffQr(order, 'pickup', '', required)).toBe(false);
  expect(acceptsHandoffQr(order, 'pickup', handoffQrToken(order, 'pickup'), required)).toBe(true);
 }
});
