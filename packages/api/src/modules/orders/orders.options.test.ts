import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrder, quoteOrder } from './orders.service';

const h = vi.hoisted(() => {
  const group = {
    id: 'group-1', productId: 'product-1', name: 'Sauce', required: true,
    minSelect: 1, maxSelect: 2,
    items: [
      { id: 'option-1', name: 'Garlic', price: 2 },
      { id: 'option-2', name: 'Chili', price: 3 },
    ],
  };
  const db = {
    store: { findUnique: vi.fn().mockResolvedValue({ id: 'store-1', isActive: true, isApproved: true }) },
    product: { findMany: vi.fn().mockResolvedValue([{ id: 'product-1', nameAr: 'Meal', price: 15, isAvailable: true }]) },
    productOptionGroup: { findMany: vi.fn().mockResolvedValue([group]) },
    deliveryZone: { findFirst: vi.fn().mockResolvedValue(null) },
    deliveryPricingConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    platformSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    dailyOrderSequence: { upsert: vi.fn().mockResolvedValue({ sequence: 1 }) },
    order: { create: vi.fn().mockResolvedValue({ id: 'order-1' }) },
  };
  return { group, db };
});

vi.mock('../../lib/prisma', () => ({
  prisma: { ...h.db, $transaction: (callback: (tx: typeof h.db) => Promise<unknown>) => callback(h.db) },
}));
vi.mock('../../config/env', () => ({
  env: { deliveryFeeConfig: { baseFee: 0, bulkFee: 0, bulkThreshold: 5, currency: 'ILS' } },
}));
vi.mock('./orders.mapper', () => ({ toOrderDetail: (order: unknown) => order }));

const selection = { groupId: 'group-1', optionId: 'option-1' };
const body = { storeId: 'store-1', customerAddressText: 'Pickup at the store' };

beforeEach(() => {
  vi.clearAllMocks();
  h.db.productOptionGroup.findMany.mockResolvedValue([h.group]);
});

describe('server option validation', () => {
  it.each([undefined, []])('rejects missing required options: %j', async selectedOptions => {
    await expect(quoteOrder({
      ...body, items: [{ productId: 'product-1', quantity: 1, selectedOptions }],
    })).rejects.toMatchObject({ code: 'OPTION_MIN_REQUIRED' });
  });

  it('requires at least one selection when required is true and minSelect is zero', async () => {
    h.db.productOptionGroup.findMany.mockResolvedValue([{ ...h.group, minSelect: 0 }]);
    await expect(quoteOrder({
      ...body, items: [{ productId: 'product-1', quantity: 1 }],
    })).rejects.toMatchObject({ code: 'OPTION_MIN_REQUIRED' });
  });

  it('does not let duplicate IDs satisfy a minimum selection count', async () => {
    h.db.productOptionGroup.findMany.mockResolvedValue([{ ...h.group, minSelect: 2 }]);
    await expect(quoteOrder({
      ...body, items: [{ productId: 'product-1', quantity: 1, selectedOptions: [selection, selection] }],
    })).rejects.toMatchObject({ code: 'DUPLICATE_OPTION' });
  });

  it('enforces the minimum for an optional group once selected', async () => {
    h.db.productOptionGroup.findMany.mockResolvedValue([{ ...h.group, required: false, minSelect: 2 }]);
    await expect(quoteOrder({
      ...body, items: [{ productId: 'product-1', quantity: 1, selectedOptions: [selection] }],
    })).rejects.toMatchObject({ code: 'OPTION_MIN_REQUIRED' });
  });

  it('allows an optional group to be skipped', async () => {
    h.db.productOptionGroup.findMany.mockResolvedValue([{ ...h.group, required: false, minSelect: 2 }]);
    const quote = await quoteOrder({ ...body, items: [{ productId: 'product-1', quantity: 2 }] });
    expect(quote.subtotal).toBe(30);
  });

  it('prices valid selections from the database for every unit', async () => {
    const quote = await quoteOrder({
      ...body, items: [{ productId: 'product-1', quantity: 2, selectedOptions: [selection] }],
    });
    expect(quote.subtotal).toBe(34);
  });
});

describe('pickup with a saved delivery zone', () => {
  it.each([
    { deliveryZoneId: 'saved-zone' },
    { guestCustomerInfo: { phone: '0599000000', zoneId: 'saved-zone' } },
  ])('ignores delivery zone fields for pickup: %j', async zoneFields => {
    await createOrder('customer-1', {
      ...body, ...zoneFields, fulfillmentType: 'PICKUP',
      items: [{ productId: 'product-1', quantity: 1, selectedOptions: [selection] }],
    });
    expect(h.db.deliveryZone.findFirst).not.toHaveBeenCalled();
    expect(h.db.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deliveryFee: 0, deliveryZoneId: null, totalAmount: 17, isCaptainPriced: false }),
    }));
  });

  it('still rejects an unavailable zone for delivery', async () => {
    await expect(createOrder('customer-1', {
      ...body, deliveryZoneId: 'missing-zone', fulfillmentType: 'DELIVERY',
      items: [{ productId: 'product-1', quantity: 1, selectedOptions: [selection] }],
    })).rejects.toMatchObject({ code: 'ZONE_INACTIVE' });
    expect(h.db.order.create).not.toHaveBeenCalled();
  });
});

 describe('size pricing and ingredients',()=>{
 it('discounts the size but not paid extras, for every unit',async()=>{
 h.db.product.findMany.mockResolvedValueOnce([{id:'product-1',nameAr:'Meal',price:15,isAvailable:true,originalPrice:20}] as never);
 h.db.productOptionGroup.findMany.mockResolvedValueOnce([{...h.group,id:'size',kind:'SIZE',minSelect:1,maxSelect:1,items:[{id:'large',name:'Large',price:40}]},h.group] as never);
 const quote=await quoteOrder({...body,items:[{productId:'product-1',quantity:2,selectedOptions:[{groupId:'size',optionId:'large'},selection]}]});expect(quote.subtotal).toBe(64);
 });
 it('includes fixed ingredients even when omitted by the client',async()=>{
 h.db.productOptionGroup.findMany.mockResolvedValueOnce([{...h.group,kind:'FIXED',minSelect:2,maxSelect:2,items:h.group.items.map(i=>({...i,price:0}))}] as never);
 const quote=await quoteOrder({...body,items:[{productId:'product-1',quantity:1}]});expect(quote.subtotal).toBe(15);
 });
 });
