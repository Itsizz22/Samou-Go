import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { verifyPassword } from '../../lib/password';
import { conflict, forbidden, unauthorized } from '../../lib/http-error';
import { uploadDirs } from '../../uploads/uploads.config';

// A shared, non-login relation target preserves anonymous transaction totals.
// Deleted users' IDs, names, credentials and contact details are never copied here.
const ANONYMOUS_ID = 'system-deleted-accounts';

export async function deleteOwnAccount(userId: string, password: string): Promise<{ deleted: true }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || userId === ANONYMOUS_ID) throw unauthorized();
  if (!await verifyPassword(password, user.passwordHash)) throw forbidden('كلمة المرور غير صحيحة / Incorrect password');

  await prisma.$transaction(async tx => {
    // Lock the account and detect a concurrent password change before erasure.
    const locked = await tx.user.updateMany({ where: { id: userId, passwordHash: user.passwordHash, isActive: true }, data: { sessionVersion: { increment: 1 } } });
    if (locked.count !== 1) throw conflict('تغيرت الجلسة؛ سجّل الدخول مجددًا / Session changed; sign in again');
    const active = await tx.order.count({ where: {
      status: { notIn: ['DELIVERED', 'CANCELLED'] },
      OR: [{ customerId: userId }, { captainId: userId }, { store: { managerId: userId } }],
    } });
    if (active) throw conflict('أكمل أو ألغِ الطلبات الجارية ثم أعد حذف الحساب من هنا / Complete or cancel active orders, then delete your account here');

    await tx.user.upsert({ where: { id: ANONYMOUS_ID }, update: {}, create: {
      id: ANONYMOUS_ID, name: 'حساب محذوف', phone: '__deleted__',
      passwordHash: `!disabled:${randomUUID()}`, isActive: false, isVerified: false,
      marketingNotificationsEnabled: false,
    } });
    const ownedOrders = { customerId: userId };
    await tx.orderItem.updateMany({ where: { order: ownedOrders }, data: { note: null } });
    await tx.orderStatusHistory.updateMany({ where: { OR: [{ changedByUserId: userId }, { order: ownedOrders }] }, data: { note: null, changedByUserId: null } });
    await tx.chatMessage.deleteMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }, { order: ownedOrders }] } });
    await tx.rating.deleteMany({ where: { OR: [{ customerId: userId }, { captainId: userId }] } });
    await tx.order.updateMany({ where: ownedOrders, data: {
      customerId: ANONYMOUS_ID, customerAddressText: 'محذوف', addressNote: null, orderNote: null,
      deliveryPreset: null, latitude: null, longitude: null, voiceNoteUrl: null,
      voiceNoteDuration: null, deliveryPin: null, captainHandoffCode: null, changeProposal: null,
    } });
    await tx.order.updateMany({ where: { dispatchCaptainId: userId }, data: { dispatchCaptainId: null, dispatchExpiresAt: null } });
    await tx.store.updateMany({ where: { managerId: userId }, data: {
      managerId: ANONYMOUS_ID, isActive: false, isAcceptingOrders: false,
      storeStatus: 'CLOSED', phone: '', whatsappNumber: null,
    } });
    // Keep financial totals without linking a wallet or ledger to a deleted person.
    await tx.ledgerEntry.updateMany({ where: { OR: [{ userId }, { wallet: { userId } }] }, data: { userId: null, description: null } });
    await tx.settlement.updateMany({ where: { wallet: { userId } }, data: { note: null } });
    await tx.wallet.updateMany({ where: { userId }, data: { userId: null } });
    await tx.ticketMessage.deleteMany({ where: { senderId: userId } });
    // Checkout replay snapshots can also embed a staff/store contact in another
    // customer's response. They are caches, not financial source records.
    await tx.orderSubmission.deleteMany({ where: { OR: [
      { customerId: userId }, { response: { contains: userId } }, { response: { contains: user.phone } },
    ] } });
    await tx.notificationDelivery.deleteMany({ where: { userId } });
    await tx.otpRequest.deleteMany({ where: { phone: user.phone } });

    // Remove durable media and local originals/cache. Restrict every directory to
    // the configured upload root before any recursive filesystem operation.
    const prefixes = ['user', 'audio', 'video'].map(kind => `${kind}/${userId}/`);
    await tx.storedUpload.deleteMany({ where: { OR: prefixes.map(prefix => ({ key: { startsWith: prefix } })) } });
    for (const root of [uploadDirs.rawDir, uploadDirs.finalDir]) {
      for (const prefix of prefixes) {
        const absoluteRoot = path.resolve(root);
        const target = path.resolve(absoluteRoot, prefix);
        if (!target.startsWith(absoluteRoot + path.sep)) throw new Error('Invalid account media path');
        await rm(target, { recursive: true, force: true });
      }
    }
    // Cascades delete refresh sessions, push tokens, favorites, GPS, custom
    // requests and support tickets. Remaining optional references become null.
    await tx.user.delete({ where: { id: userId } });
  }, { isolationLevel: 'Serializable', timeout: 20000 });
  return { deleted: true };
}
