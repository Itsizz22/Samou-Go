/**
 * Bottom sheet for selecting product options/addons before adding to cart.
 * Appears when a product has optionGroups — shows checkboxes/radios for each
 * group with live price calculation.
 */
import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const { t } = useLanguage();
  const groups = useMemo(() => product.optionGroups ?? [], [product.optionGroups]);
  const [quantity, setQuantity] = useState(1);
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
        if (selected.has(item.id)) total += item.priceDelta;
      }
    }
    return total;
  }, [groups, selections]);

  const unitTotal = product.price + optionsExtra;
  const grandTotal = unitTotal * quantity;

  const isValid = useMemo(() => {
    for (const group of groups) {
      if (!group.required) continue;
      const count = selections[group.id]?.size ?? 0;
      if (count < group.minSelect) return false;
    }
    return true;
  }, [groups, selections]);

  const selectedOptions = useMemo(() => {
    const result: { groupId: string; optionId: string }[] = [];
    for (const group of groups) {
      const selected = selections[group.id];
      if (!selected) continue;
      for (const optionId of selected) {
        result.push({ groupId: group.id, optionId });
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold text-ink">{product.nameAr}</h2>
            <p className="text-xs text-ink-muted">{t(storeNameAr, storeNameAr)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 transition hover:bg-canvas active:scale-90"
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
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="rounded-full p-2 transition active:scale-90"
              >
                <Minus size={14} />
              </button>
              <span className="min-w-[24px] text-center text-sm font-bold">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(q => Math.min(99, q + 1))}
                className="rounded-full p-2 transition active:scale-90"
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
