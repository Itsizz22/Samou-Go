import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TicketStatus, UserRole, type JwtPayload } from '@samou-go/shared-types';
import { createTicket, listTickets, getTicket, addMessage, updateTicketStatus } from './support.service';
const db = vi.hoisted(() => ({ supportTicket: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, ticketMessage: { create: vi.fn() }, order: { findUnique: vi.fn() } }));
vi.mock('../../lib/prisma', () => ({ prisma: { ...db, $transaction: async (work: (tx: typeof db) => Promise<unknown>) => work(db) }, caseInsensitiveContains: (value: string) => ({ contains: value }) }));
const customer: JwtPayload = { sub: 'customer-test', role: UserRole.CUSTOMER, phone: '0599000007' };
const admin: JwtPayload = { ...customer, sub: 'admin-test', role: UserRole.ADMIN };
beforeEach(() => { vi.resetAllMocks(); db.supportTicket.create.mockResolvedValue({ id: 'ticket-1' }); db.supportTicket.findMany.mockResolvedValue([]); db.supportTicket.count.mockResolvedValue(0); db.supportTicket.findUnique.mockResolvedValue({ id: 'ticket-1', userId: customer.sub, status: TicketStatus.OPEN, messages: [] }); });
describe('support ticket workflow', () => {
  it('creates a ticket and its first message atomically, ignoring forged identity and status', async () => {
    await createTicket({ subject: 'مساعدة', category: 'عام', message: 'تفاصيل المشكلة', userId: 'other', ticketNumber: 'forged', status: TicketStatus.CLOSED }, customer);
    const data = db.supportTicket.create.mock.calls[0]?.[0].data;
    expect(data.userId).toBe(customer.sub); expect(data.status).toBe(TicketStatus.OPEN); expect(data.ticketNumber).toMatch(/^TKT-/); expect(data.ticketNumber).not.toBe('forged');
    expect(data.messages.create).toEqual({ senderId: customer.sub, senderRole: customer.role, message: 'تفاصيل المشكلة' });
  });
  it('generates distinct numbers for simultaneous requests', async () => {
    await Promise.all([createTicket({ subject: 'one', category: 'عام' }, customer), createTicket({ subject: 'two', category: 'عام' }, customer)]);
    expect(db.supportTicket.create.mock.calls[0]?.[0].data.ticketNumber).not.toBe(db.supportTicket.create.mock.calls[1]?.[0].data.ticketNumber);
  });
  it('returns paginated tickets scoped to the owner', async () => {
    expect(await listTickets({ page: 2, pageSize: 10 }, customer)).toMatchObject({ items: [], total: 0, page: 2, pageSize: 10 });
    expect(db.supportTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: customer.sub }, skip: 10, take: 10 }));
  });
  it('allows the admin inbox to list all owners', async () => { await listTickets({}, admin); expect(db.supportTicket.findMany.mock.calls[0]?.[0].where).not.toHaveProperty('userId'); });
  it('blocks reading another customer ticket', async () => { db.supportTicket.findUnique.mockResolvedValue({ userId: 'other' }); await expect(getTicket('ticket-1', customer)).rejects.toMatchObject({ statusCode: 403 }); });
  it('blocks replying to another customer ticket', async () => { db.supportTicket.findUnique.mockResolvedValue({ userId: 'other' }); await expect(addMessage('ticket-1', { message: 'reply' }, customer)).rejects.toMatchObject({ statusCode: 403 }); expect(db.ticketMessage.create).not.toHaveBeenCalled(); });
  it('derives reply identity from the session', async () => { await addMessage('ticket-1', { message: 'reply', senderId: 'forged', senderRole: 'ADMIN' }, customer); expect(db.ticketMessage.create.mock.calls[0]?.[0].data).toMatchObject({ senderId: customer.sub, senderRole: customer.role }); });
  it('blocks replies to closed tickets', async () => { db.supportTicket.findUnique.mockResolvedValue({ userId: customer.sub, status: TicketStatus.CLOSED }); await expect(addMessage('ticket-1', { message: 'reply' }, customer)).rejects.toMatchObject({ statusCode: 400 }); });
  it('allows only admins to resolve tickets', async () => { await expect(updateTicketStatus('ticket-1', { status: TicketStatus.RESOLVED }, customer)).rejects.toMatchObject({ statusCode: 403 }); await updateTicketStatus('ticket-1', { status: TicketStatus.RESOLVED }, admin); expect(db.supportTicket.update.mock.calls[0]?.[0].data.resolvedAt).toBeInstanceOf(Date); });
  it('rejects linking an unrelated order', async () => { db.order.findUnique.mockResolvedValue({ customerId: 'other', captainId: null, store: { managerId: 'other-manager' } }); await expect(createTicket({ subject: 'test', category: 'عام', orderId: 'unrelated' }, customer)).rejects.toMatchObject({ statusCode: 403 }); expect(db.supportTicket.create).not.toHaveBeenCalled(); });
});