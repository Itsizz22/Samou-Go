import { describe, expect, it } from 'vitest';
import { UserRole } from '@samou-go/shared-types';
import { toOrderSummary, type OrderForSummary } from './orders.mapper';
// Only fields consumed by the summary mapper are needed in this fixture.
const order = {
  captainId: 'captain-qa', id: 'order-qa', orderNumber: 'QA-1', status: 'READY_FOR_PICKUP',
  customer: { name: 'عميل تجريبي', phone: '0599000007', whatsappNumber: '+972599000007' },
  deliveryZone: { nameAr: 'السموع - المركز' },
  customerAddressText: 'شارع المدرسة، المنزل الثاني', addressNote: 'الباب الأخضر',
  store: { nameAr: 'متجر تجريبي' }, items: [],
  totalAmount: 10, deliveryFee: 0, discount: 0, createdAt: new Date(),
} as unknown as OrderForSummary;
describe('staff order contact and destination', () => {
  it.each([UserRole.STORE_MANAGER, UserRole.CAPTAIN, UserRole.ADMIN])('includes actual contact and address for %s', role => {
    const result = toOrderSummary(order, role, "captain-qa");
    expect(result.customerContact).toEqual(order.customer);
    expect(result.deliveryDestination).toEqual({ zoneNameAr: 'السموع - المركز', address: order.customerAddressText, landmark: order.addressNote });
  });
  it.each([UserRole.CUSTOMER, undefined])('does not expose staff contact fields for %s', role => {
    const result = toOrderSummary(order, role, "captain-qa");
    expect(result.customerContact).toBeNull();
    expect(result.deliveryDestination).toBeNull();
  });
  it('preserves the typed address when an older order has no zone', () => {
    const result = toOrderSummary({ ...order, deliveryZone: null }, UserRole.CAPTAIN, "captain-qa");
    expect(result.deliveryDestination?.zoneNameAr).toBeNull();
    expect(result.deliveryDestination?.address).toBe(order.customerAddressText);
  });
});
it('hides customer identity and exact destination from captains without the reservation', () => {
  for (const viewerId of [undefined, 'another-captain']) {
    const result = toOrderSummary(order, UserRole.CAPTAIN, viewerId);
    expect(result.customerContact).toBeNull();
    expect(result.deliveryDestination?.address).toBe('يظهر العنوان بعد حجز التوصيل');
    expect(result.deliveryDestination?.zoneNameAr).toBe('السموع - المركز');
    expect(result.itemNotes).toEqual([]);
  }
});

it('returns every kitchen line, including offers and options, without requiring notes', () => {
  const fixture = { ...order, items: [
    { id: 'plain', quantity: 2, totalPrice: 38, note: null, selectedOptions: null, product: { nameAr: 'Pizza' } },
    { id: 'offer', quantity: 1, totalPrice: 25, note: 'No onions', offerTitle: 'Burger offer', selectedOptions: JSON.stringify([{ name: 'Cheese' }]), product: null },
  ] } as unknown as OrderForSummary;
  const result = toOrderSummary(fixture, UserRole.STORE_MANAGER);
  expect(result.items).toEqual([
    { id: 'plain', productNameAr: 'Pizza', quantity: 2, totalPrice: 38, note: null, optionNames: [] },
    { id: 'offer', productNameAr: 'Burger offer', quantity: 1, totalPrice: 25, note: 'No onions', optionNames: ['Cheese'] },
  ]);
  expect(result.itemCount).toBe(3);
  expect(toOrderSummary(fixture, UserRole.CAPTAIN, 'another-captain').items).toBeUndefined();
  expect(toOrderSummary(fixture, UserRole.CUSTOMER).items).toBeUndefined();
});
