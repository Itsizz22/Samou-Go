/**
 * IncomingOrderModal — full-screen overlay for new incoming orders.
 *
 * Plays an infinite looping chime with vibration until the manager accepts
 * or rejects the order. This is the unmissable dispatch alert for the
 * store-manager dashboard.
 */
import { useEffect, useRef } from 'react';
import { Check, X, ShoppingBag } from 'lucide-react';
import { createInfiniteLoopingAlert } from '../chime';

export interface IncomingOrderItem {
  nameAr: string;
  quantity: number;
}

export interface IncomingOrderModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Order number (e.g. SG-00042). */
  orderNumber: string;
  /** Customer address or a short description. */
  address?: string;
  /** Items in the order. */
  items: IncomingOrderItem[];
  /** Total amount (subtotal). */
  subtotal: number;
  /** Whether the order is a pickup. */
  isPickup?: boolean;
  /** Called when the manager taps "Accept". */
  onAccept: () => void;
  /** Called when the manager taps "Reject". */
  onReject: () => void;
}

export function IncomingOrderModal({
  open,
  orderNumber,
  address,
  items,
  subtotal,
  isPickup = false,
  onAccept,
  onReject,
}: IncomingOrderModalProps) {
  const stopAlarmRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (open) {
      // Start the infinite looping alarm
      stopAlarmRef.current = createInfiniteLoopingAlert();
    }
    return () => {
      if (stopAlarmRef.current) {
        stopAlarmRef.current();
        stopAlarmRef.current = null;
      }
    };
  }, [open]);

  const handleAccept = () => {
    if (stopAlarmRef.current) {
      stopAlarmRef.current();
      stopAlarmRef.current = null;
    }
    onAccept();
  };

  const handleReject = () => {
    if (stopAlarmRef.current) {
      stopAlarmRef.current();
      stopAlarmRef.current = null;
    }
    onReject();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {/* Pulsing background ring */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-64 w-64 rounded-full border-4 border-brand/30 animate-ping" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-48 w-48 rounded-full border-4 border-brand/50 animate-pulse" />
      </div>

      {/* Modal card */}
      <div className="relative mx-4 w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand animate-bounce">
            <ShoppingBag size={28} className="text-white" />
          </div>
          <h2 className="text-lg font-extrabold text-ink">طلب جديد!</h2>
          <p className="mt-1 text-sm font-bold text-brand-dark">#{orderNumber}</p>
          {isPickup && (
            <span className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-800">
              استلام من الفرع
            </span>
          )}
        </div>

        {/* Order items */}
        <div className="mt-4 rounded-xl bg-canvas p-3">
          {items.slice(0, 5).map((item, i) => (
            <div key={i} className="flex justify-between py-1 text-xs">
              <span className="text-ink-muted">{item.nameAr}</span>
              <span className="font-bold text-ink">×{item.quantity}</span>
            </div>
          ))}
          {items.length > 5 && (
            <p className="pt-1 text-center text-[10px] text-ink-muted">
              +{items.length - 5} منتجات إضافية
            </p>
          )}
          <div className="mt-2 flex justify-between border-t border-line pt-2">
            <span className="text-xs font-extrabold text-ink">المجموع</span>
            <span className="text-sm font-extrabold text-brand-dark" dir="ltr">
              {subtotal.toFixed(2)} ₪
            </span>
          </div>
        </div>

        {address && (
          <p className="mt-3 text-center text-[11px] text-ink-muted truncate">
            📍 {address}
          </p>
        )}

        {/* Action buttons */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={handleReject}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-danger bg-danger-tint py-3 text-sm font-extrabold text-danger-ink transition active:scale-95"
          >
            <X size={18} />
            رفض الطلب
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-extrabold text-white transition active:scale-95"
          >
            <Check size={18} />
            قبول الطلب
          </button>
        </div>
      </div>
    </div>
  );
}
