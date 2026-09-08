import { useAndroidOverlayBack } from '@/lib/androidBack';
import { normalizeOptionGroups } from '@samou-go/shared-types';
/**
 * Bottom sheet for selecting product options/addons before adding to cart.
 * Appears when a product has optionGroups — shows checkboxes/radios for each
 * group with live price calculation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion';
import { X, Plus, Minus, ShoppingBag } from 'lucide-react';
import type { Product, ProductOptionGroup } from '@samou-go/shared-types';
import { useLanguage } from '@samou-go/ui';
import { formatCurrency } from '@/lib/delivery';

interface Props {
  product: Product;
  storeNameAr: string;
  onClose: () => void;
  onConfirm: (options: { groupId: string; optionId: string }[], quantity: number) => void;
}

export function ProductOptionsSheet({ product, storeNameAr, onClose, onConfirm }: Props) {
  useAndroidOverlayBack(true, onClose);
  const { t } = useLanguage();
  const dragControls = useDragControls();
  const reduced = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => normalizeOptionGroups(product.optionGroups), [product.optionGroups]);
  const [quantity, setQuantity] = useState(1);
  useEffect(() => {
    const previous = document.body.style.overflow;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous;
      focused?.focus(); };
  }, []);
  // selections[groupId] = Set<optionId>
  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const g of groups) init[g.id] = new Set();
    return init;
  });

  const toggleOption = useCallback((groupId: string, optionId: string, maxSelect: number) => {
    setSelections(prev => {
      const next = { ...prev };
      const set = new Set(next[groupId] ?? []);
      if (set.has(optionId)) {
        set.delete(optionId);
      } else {
        if (maxSelect === 1) set.clear();
        if (set.size < maxSelect) set.add(optionId);
      }
      next[groupId] = set;
      return next;
    });
  }, []);

  const optionsExtra = useMemo(() => {
    let total = 0;
    for (const group of groups) {
      const selected = selections[group.id];
      if (!selected) continue;
      for (const item of group.items) {
        if (item.isActive && selected.has(item.id)) total += item.priceDelta;
      }
    }
    return total;
  }, [groups, selections]);

  const unitTotal = product.price + optionsExtra;
  const grandTotal = unitTotal * quantity;

  const isValid = useMemo(() => {
    for (const group of groups) {
      const count = group.items.filter(item => item.isActive && selections[group.id]?.has(item.id)).length;
      if (count < (group.required ? Math.max(1, group.minSelect) : group.minSelect) || count > group.maxSelect) return false;
    }
    return true;
  }, [groups, selections]);

  const selectedOptions = useMemo(() => {
    const result: { groupId: string; optionId: string }[] = [];
    for (const group of groups) {
      const selected = selections[group.id];
      if (!selected) continue;
      for (const optionId of selected) {
        if (group.items.some(item => item.id === optionId && item.isActive)) result.push({ groupId: group.id, optionId });
      }
    }
    return result;
  }, [groups, selections]);

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(selectedOptions, quantity);
  };

  return (
    <AnimatePresence>
      <motion.div key="options-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />
      <motion.div key="options-panel"
        ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="product-options-title"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
          if (event.key !== 'Tab') return;
          const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
          const first = buttons?.[0];
          const last = buttons?.[buttons.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}
        initial={reduced ? false : { y: '100%' }}
        animate={{ y: 0 }}
        exit={reduced ? { opacity: 0 } : { y: '100%' }}
        transition={reduced ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 300 }}
        drag="y" dragControls={dragControls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: .5 }} dragSnapToOrigin
        onDragEnd={(_, info) => { if (info.offset.y > 100 || (info.offset.y > 20 && info.velocity.y > 600)) onClose(); }}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" aria-label={t('اسحب لأسفل أو اضغط لإغلاق الخيارات', 'Drag down or tap to close options')} onClick={onClose} onPointerDown={event => dragControls.start(event)} className="flex min-h-11 w-full touch-none items-center justify-center"><span className="h-1 w-10 rounded-full bg-line" /></button>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="product-options-title" className="text-base font-extrabold text-ink">{product.nameAr}</h2>
            <p className="text-xs text-ink-muted">{t(storeNameAr, storeNameAr)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('إغلاق خيارات المنتج', 'Close product options')}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 transition hover:bg-canvas active:scale-90"
          >
            <X size={20} />
          </button>
        </div>

        {/* Base price */}
        <div className="px-5 py-3">
          <p className="text-sm font-bold text-brand-dark" dir="ltr">
            {formatCurrency(product.price)}
          </p>
        </div>

        {/* Option groups */}
        <div className="space-y-4 px-5 pb-4">
          {groups.map(group => (
            <div key={group.id}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink">{group.name}</h3>
                {group.required && (
                  <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[10px] font-bold text-danger">
                    {t('مطلوب', 'Required')}
                  </span>
                )}
                <span className="text-[11px] text-ink-muted">
                  {group.maxSelect === 1
                    ? t('اختر واحداً', 'Choose one')
                    : t(`اختر حتى ${group.maxSelect}`, `Choose up to ${group.maxSelect}`)}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.filter(i => i.isActive).map(item => {
                  const selected = selections[group.id]?.has(item.id) ?? false;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleOption(group.id, item.id, group.maxSelect)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition ${
                        selected
                          ? 'border-brand bg-brand-surface text-ink'
                          : 'border-line bg-white text-ink hover:border-brand/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                          selected ? 'border-brand bg-brand text-white' : 'border-gray-300'
                        }`}>
                          {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                        </span>
                        <span className="font-medium">{item.name}</span>
                      </div>
                      {item.priceDelta > 0 && (
                        <span className="text-xs font-bold text-brand-dark" dir="ltr">
                          +{formatCurrency(item.priceDelta)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Quantity + total + confirm */}
        <div className="sticky bottom-0 border-t border-line bg-white px-5 py-4">
          <div className="flex items-center justify-between">
            {/* Quantity stepper */}
            <div className="flex items-center gap-1 rounded-full bg-canvas px-1 py-1">
              <button
                type="button"
                aria-label={t('إنقاص الكمية', 'Decrease quantity')}
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 transition active:scale-90"
              >
                <Minus size={14} />
              </button>
              <span className="min-w-6 text-center text-sm font-bold">{quantity}</span>
              <button
                type="button"
                aria-label={t('زيادة الكمية', 'Increase quantity')}
                onClick={() => setQuantity(q => Math.min(99, q + 1))}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 transition active:scale-90"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Confirm button */}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!isValid}
              className="flex items-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-brand transition active:scale-[0.98] disabled:opacity-50"
            >
              <ShoppingBag size={16} />
              {t('أضف إلى السلة', 'Add to cart')} · {formatCurrency(grandTotal)}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
