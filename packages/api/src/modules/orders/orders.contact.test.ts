import { describe, expect, it } from 'vitest';
import { UserRole } from '@samou-go/shared-types';
import { toOrderSummary, type OrderForSummary } from './orders.mapper';
// Only fields consumed by the summary mapper are needed in this fixture.
const order = {
  id: 'order-qa', orderNumber: 'QA-1', status: 'READY_FOR_PICKUP',
  customer: { name: 'عميل تجريبي', phone: '0599000007' },
  deliveryZone: { nameAr: 'السموع - المركز' },
  customerAddressText: 'شارع المدرسة، المنزل الثاني', addressNote: 'الباب الأخضر',
  store: { nameAr: 'متجر تجريبي' }, items: [],
  totalAmount: 10, deliveryFee: 0, discount: 0, createdAt: new Date(),
} as unknown as OrderForSummary;
describe('staff order contact and destination', () => {
  it.each([UserRole.STORE_MANAGER, UserRole.CAPTAIN, UserRole.ADMIN])('includes actual contact and address for %s', role => {
    const result = toOrderSummary(order, role);
    expect(result.customerContact).toEqual(order.customer);
    expect(result.deliveryDestination).toEqual({ zoneNameAr: 'السموع - المركز', address: order.customerAddressText, landmark: order.addressNote });
  });
  it.each([UserRole.CUSTOMER, undefined])('does not expose staff contact fields for %s', role => {
    const result = toOrderSummary(order, role);
    expect(result.customerContact).toBeNull();
    expect(result.deliveryDestination).toBeNull();
  });
  it('preserves the typed address when an older order has no zone', () => {
    const result = toOrderSummary({ ...order, deliveryZone: null }, UserRole.CAPTAIN);
    expect(result.deliveryDestination?.zoneNameAr).toBeNull();
    expect(result.deliveryDestination?.address).toBe(order.customerAddressText);
  });
});