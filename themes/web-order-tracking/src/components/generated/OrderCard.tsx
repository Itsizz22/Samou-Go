import React from 'react';
import { Package, Clock, ChevronRight, CheckCircle2, Truck, Store, Handshake, XCircle } from 'lucide-react';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  OrderStatus,
  type StatusTone,
} from '@samou-go/shared-types';
import { formatCurrency } from '@/lib/delivery';
import { useLanguage } from '@samou-go/ui';

interface OrderCardProps {
  id: string;
  storeName: string;
  arabicStoreName?: string;
  /** The canonical status from the API — not a local lowercase variant. */
  status: OrderStatus;
  itemsCount: number;
  totalPrice: number;
  date: string;
  onDetailsClick?: (id: string) => void;
}

/**
 * Labels and tones come from `@samou-go/shared-types`, so this card can never
 * disagree with the server about what a status is called or what colour it is.
 * Only the glyph is a presentation choice, and it lives here.
 */
const STATUS_ICONS: Record<OrderStatus, React.ComponentType<{ className?: string }>> = {
  [OrderStatus.PENDING]: Clock,
  [OrderStatus.ACCEPTED]: Handshake,
  [OrderStatus.PREPARING]: Store,
  [OrderStatus.READY_FOR_PICKUP]: Package,
  [OrderStatus.ON_THE_WAY]: Truck,
  [OrderStatus.DELIVERED]: CheckCircle2,
  [OrderStatus.CANCELLED]: XCircle,
};

/** The `badge-*` palette from `src/index.css` §7.4, as raw utilities. */
const TONE_CLASSES: Record<StatusTone, string> = {
  brand: 'bg-brand-tint text-brand-deep',
  warning: 'bg-warning-tint text-warning-ink',
  info: 'bg-info-tint text-info-ink',
  danger: 'bg-danger-tint text-danger-ink',
  neutral: 'bg-canvas text-ink-muted',
};

export const OrderCard: React.FC<OrderCardProps> = ({
  id,
  storeName,
  arabicStoreName,
  status,
  itemsCount,
  totalPrice,
  date,
  onDetailsClick
}) => {
  const label = ORDER_STATUS_LABELS[status];
  const StatusIcon = STATUS_ICONS[status];
  const toneClass = TONE_CLASSES[ORDER_STATUS_TONES[status]];
  const { t } = useLanguage();
  return <div onClick={() => onDetailsClick?.(id)} className="p-4 transition-all bg-surface border border-line rounded-xl shadow-card hover:shadow-raised active:scale-[0.98] cursor-pointer">
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <h3 className="font-bold text-ink">{arabicStoreName ? t(arabicStoreName, storeName) : storeName}</h3>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${toneClass}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          <div className="flex flex-col items-start leading-none">
            <span>{t(label.ar, label.en)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between pt-3 border-t border-line-soft">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Package className="w-4 h-4" />
            <span>{t(`${itemsCount} ${itemsCount === 1 ? 'صنف' : 'أصناف'}`, `${itemsCount} ${itemsCount === 1 ? 'item' : 'items'}`)}</span>
          </div>
          <div className="text-xs text-ink-muted">{date}</div>
        </div>

        <div className="flex flex-col items-end">
          <div dir="ltr" className="text-lg font-black text-brand-dark">
            {formatCurrency(totalPrice, {
            unit: 'code',
            decimals: 2
          })}
          </div>
          <div className="flex items-center gap-1 text-xs font-medium text-brand">
            <span>{t('التفاصيل', 'Details')}</span>
            <ChevronRight className="w-3 h-3 rtl:rotate-180" />
          </div>
        </div>
      </div>
    </div>;
};
export default OrderCard;
