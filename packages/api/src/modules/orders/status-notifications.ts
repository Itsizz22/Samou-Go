import { ORDER_STATUS_LABELS, OrderStatus, type OrderDetail } from '@samou-go/shared-types';
import { sendPushToUser, sendPushToMany } from '../../lib/push';

export async function notifyStatusChange(
  order: OrderDetail,
  orderId: string,
  newStatus: string
): Promise<void> {
  try {
    const labels = ORDER_STATUS_LABELS[newStatus as OrderStatus];
    if (!labels) return;

    switch (newStatus) {
      case OrderStatus.ACCEPTED: {
        // Store accepted → notify the customer.
        await sendPushToUser(order.customerId, {
          title: 'تم قبول الطلب ✅',
          body: `قبل متجر ${order.store.nameAr} طلبك #${order.orderNumber}`,
          data: { orderId, type: 'ORDER_STATUS', status: newStatus, screen: 'tracking' },
        });
        break;
      }
      case OrderStatus.PREPARING: {
        // Store is preparing → notify the customer.
        await sendPushToUser(order.customerId, {
          title: 'جاري التحضير 👨‍🍳',
          body: `طلبك #${order.orderNumber} قيد التحضير`,
          data: { orderId, type: 'ORDER_STATUS', status: newStatus, screen: 'tracking' },
        });
        break;
      }
      case OrderStatus.READY_FOR_PICKUP: {
        // Ready → notify the customer + all available captains.
        await sendPushToUser(order.customerId, {
          title: 'جاهز للاستلام 📦',
          body: order.fulfillmentType === 'PICKUP' ? `طلبك #${order.orderNumber} جاهز لاستلامه من المتجر` : `طلبك #${order.orderNumber} جاهز — في انتظار الكابتن`,
          data: { orderId, type: 'ORDER_STATUS', status: newStatus, screen: 'tracking' },
        });
        // Notify the assigned captain; unassigned orders use the exclusive dispatcher.
        // Uses data-only payloads so Android can route to the correct
        // notification channel based on the captain's ring preference.
        const availableCaptains = order.fulfillmentType === 'PICKUP' ? [] : order.captainId ? [order.captainId] : [];
        if (availableCaptains.length > 0) {
          await sendPushToMany(
            availableCaptains,
            {
              title: 'طلب جاهز للاستلام 📦',
              body: `طلب #${order.orderNumber} من ${order.store.nameAr} جاهز للاستلام`,
              data: { orderId, type: 'NEW_ORDER', storeId: order.storeId, screen: 'order' },
            },
            { dataOnly: true }
          );
        }
        break;
      }
      case OrderStatus.ON_THE_WAY: {
        // Captain picked up → notify the customer.
        if (order.customerId) {
          await sendPushToUser(order.customerId, {
            title: 'في الطريق إليك 🚗',
            body: `طلبك #${order.orderNumber} في الطريق — الكابتن في الطريق`,
            data: { orderId, type: 'ORDER_STATUS', status: newStatus, screen: 'tracking' },
          });
        }
        break;
      }
      case OrderStatus.DELIVERED: {
        // Delivered → notify the customer.
        await sendPushToUser(order.customerId, {
          title: order.fulfillmentType === 'PICKUP' ? 'تم استلام الطلب ✅' : 'تم التوصيل 🎉',
          body: `طلبك #${order.orderNumber} مكتمل — بالعافية!`,
          data: { orderId, type: 'ORDER_STATUS', status: newStatus, screen: 'tracking' },
        });
        break;
      }
      case OrderStatus.CANCELLED: {
        await sendPushToUser(order.customerId, {
          title: 'تم إلغاء الطلب ❌',
          body: `طلب #${order.orderNumber} تم إلغاؤه`,
          data: { orderId, type: 'ORDER_STATUS', status: newStatus, screen: 'tracking' },
        });
        // Cancelled → notify the other party.
        // If customer cancelled, notify store manager. If store cancelled, notify customer.
        if (order.captainId) {
          await sendPushToUser(order.captainId, {
            title: 'تم إلغاء الطلب ❌',
            body: `طلب #${order.orderNumber} تم إلغاؤه`,
            data: { orderId, screen: 'order' },
          });
        }
        break;
      }
    }
  } catch {
    // Push failure must never break the status update response.
  }
}

