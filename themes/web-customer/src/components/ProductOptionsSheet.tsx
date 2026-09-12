import { useAndroidOverlayBack } from '@/lib/androidBack';
import { normalizeOptionGroups } from '@samou-go/shared-types';
/**
 * Bottom sheet for selecting product options/addons before adding to cart.
 * Appears when a product has optionGroups — shows checkboxes/radios for each
 * group with live price calculation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion';
import { X, Plus, Minus, ShoppingBag, Check, Leaf, Ruler, Utensils } from 'lucide-react';
import type { Product, ProductOptionGroup } from '@samou-go/shared-types';
import { ImageWithFallback, useLanguage } from '@samou-go/ui';
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
    return () => {
      document.body.style.overflow = previous;
      focused?.focus();
    };
  }, []);
  // selections[groupId] = Set<optionId>
  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const g of groups)
      init[g.id] = new Set(
        g.items
          .filter(i => i.isActive && (g.kind === 'FIXED' || i.isDefault))
          .slice(0, g.maxSelect)
          .map(i => i.id)
      );
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

  const unitTotal = Math.round((product.price + optionsExtra) * 100) / 100;
  const grandTotal = unitTotal * quantity;

  const isValid = useMemo(() => {
    for (const group of groups) {
      const count = group.items.filter(
        item => item.isActive && selections[group.id]?.has(item.id)
      ).length;
      if (!group.required && count === 0) continue;
      if (
        count < (group.required ? Math.max(1, group.minSelect) : group.minSelect) ||
        count > group.maxSelect
      )
        return false;
    }
    return true;
  }, [groups, selections]);

  const selectedOptions = useMemo(() => {
    const result: { groupId: string; optionId: string }[] = [];
    for (const group of groups) {
      const selected = selections[group.id];
      if (!selected) continue;
      for (const optionId of selected) {
        if (group.items.some(item => item.id === optionId && item.isActive))
          result.push({ groupId: group.id, optionId });
      }
    }
    return result;
  }, [groups, selections]);

  const firstIncomplete = groups.find(group => {
    const count = group.items.filter(
      item => item.isActive && selections[group.id]?.has(item.id)
    ).length;
    return (
      (group.required || count > 0) && count < Math.max(group.minSelect, group.required ? 1 : 0)
    );
  });
  function selectionHint(group: ProductOptionGroup) {
    const min = Math.max(group.minSelect, group.required ? 1 : 0);
    if (group.kind === 'FIXED') return t('مشمولة ولا يمكن إزالتها', 'Included, cannot be removed');
    if (group.kind === 'INGREDIENT')
      return t('أزل المكونات التي لا تريدها', 'Uncheck ingredients to remove');
    if (group.maxSelect === 1)
      return min
        ? t('اختر واحدًا', 'Choose one')
        : t('اختياري · اختر واحدًا كحد أقصى', 'Optional · choose up to one');
    return min
      ? t(`اختر من ${min} إلى ${group.maxSelect}`, `Choose ${min}–${group.maxSelect}`)
      : t(`اختياري · اختر حتى ${group.maxSelect}`, `Optional · choose up to ${group.maxSelect}`);
  }
  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(selectedOptions, quantity);
  };

  return (
    <AnimatePresence>
      <motion.div
        key="options-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />
      <motion.div
        key="options-panel"
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-options-title"
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
          if (event.key !== 'Tab') return;
          const buttons =
            panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
          const first = buttons?.[0];
          const last = buttons?.[buttons.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === panel.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        initial={reduced ? false : { y: '100%' }}
        animate={{ y: 0 }}
        exit={reduced ? { opacity: 0 } : { y: '100%' }}
        transition={reduced ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 300 }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        dragSnapToOrigin
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || (info.offset.y > 20 && info.velocity.y > 600)) onClose();
        }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label={t('اسحب لأسفل أو اضغط لإغلاق الخيارات', 'Drag down or tap to close options')}
          onClick={onClose}
          onPointerDown={event => dragControls.start(event)}
          className="flex min-h-11 w-full touch-none items-center justify-center"
        >
          <span className="h-1 w-10 rounded-full bg-line" />
        </button>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="product-options-title" className="text-base font-extrabold text-ink">
              {product.nameAr}
            </h2>
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-lg px-5 pt-4">
            {product.imageUrl && (
              <ImageWithFallback
                src={product.imageUrl}
                alt={product.nameAr}
                className="max-h-44 w-full rounded-2xl bg-canvas object-contain"
              />
            )}
            {product.description && (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
                {product.description}
              </p>
            )}
          </div>
          {/* Base price */}
          <div className="px-5 py-3">
            <p className="text-sm font-bold text-brand-dark" dir="ltr">
              {formatCurrency(product.price)}
            </p>
          </div>

          {/* Option groups */}
          <div className="space-y-6 bg-canvas px-4 py-5">
            {groups.map(group => (
              <div
                key={group.id}
                data-option-group={group.id}
                tabIndex={-1}
                className="scroll-mt-4 outline-none"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-ink">{group.name}</h3>
                  {(group.required || group.kind === 'SIZE') && group.kind !== 'FIXED' && (
                    <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[10px] font-bold text-danger">
                      {t('مطلوب', 'Required')}
                    </span>
                  )}
                  <span className="text-[11px] text-ink-muted">{selectionHint(group)}</span>
                </div>
                {group.kind !== 'FIXED' && (
                  <p className="mb-2 text-xs text-ink-muted" aria-live="polite">
                    {t(
                      `تم اختيار ${selections[group.id]?.size ?? 0} من ${group.maxSelect}`,
                      `Selected ${selections[group.id]?.size ?? 0} of ${group.maxSelect}`
                    )}
                  </p>
                )}
                <div className="overflow-hidden rounded-2xl bg-surface">
                  {group.items
                    .filter(i => i.isActive)
                    .map(item => {
                      const selected = selections[group.id]?.has(item.id) ?? false;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={selected}
                          disabled={
                            group.kind === 'FIXED' ||
                            (!selected &&
                              group.maxSelect > 1 &&
                              (selections[group.id]?.size ?? 0) >= group.maxSelect)
                          }
                          onClick={() => toggleOption(group.id, item.id, group.maxSelect)}
                          className={`flex min-h-20 w-full items-center gap-3 border-b border-line px-4 py-3 text-start text-sm transition last:border-b-0 active:bg-brand-surface disabled:cursor-default ${selected ? 'bg-brand-surface/40' : 'bg-surface hover:bg-canvas'}`}
                        >
                          {item.imageUrl ? (
                            <ImageWithFallback
                              src={item.imageUrl}
                              alt=""
                              className="h-12 w-12 shrink-0 rounded-xl object-contain"
                            />
                          ) : (
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-canvas text-brand">
                              {group.kind === 'SIZE' ? (
                                <Ruler size={22} />
                              ) : group.kind === 'ADDON' ? (
                                <Utensils size={22} />
                              ) : (
                                <Leaf size={22} />
                              )}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold">{item.name}</span>
                            <span className="text-xs text-ink-muted" dir="ltr">
                              {group.kind === 'SIZE'
                                ? formatCurrency(
                                    Math.round((product.price + item.priceDelta) * 100) / 100
                                  )
                                : item.priceDelta > 0
                                  ? '+' + formatCurrency(item.priceDelta)
                                  : t('مشمولة', 'Included')}
                            </span>
                          </span>
                          {group.kind === 'FIXED' ? (
                            <span className="text-xs text-ink-muted">{t('ثابت', 'Fixed')}</span>
                          ) : (
                            <span
                              aria-hidden="true"
                              className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 ${group.maxSelect === 1 ? 'rounded-full' : 'rounded-md'} ${selected ? 'border-brand bg-brand text-white' : 'border-line'}`}
                            >
                              {selected && <Check size={16} />}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Quantity + total + confirm */}
        {!isValid && (
          <p role="status" className="shrink-0 bg-canvas px-4 py-2 text-xs text-danger">
            {firstIncomplete
              ? t(`أكمل اختيار: ${firstIncomplete.name}`, `Complete: ${firstIncomplete.name}`)
              : t('راجع حدود الاختيار', 'Check selection limits')}
            {firstIncomplete && (
              <button
                type="button"
                className="ms-2 min-h-11 font-bold underline"
                onClick={() => {
                  const target = Array.from(
                    panel.current?.querySelectorAll<HTMLElement>('[data-option-group]') ?? []
                  ).find(node => node.dataset.optionGroup === firstIncomplete.id);
                  target?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
                  target?.focus({ preventScroll: true });
                }}
              >
                {t('اختيار الآن', 'Choose now')}
              </button>
            )}
          </p>
        )}
        <div className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col-reverse items-stretch justify-between gap-2 min-[360px]:flex-row min-[360px]:items-center">
            {/* Quantity stepper */}
            <div className="flex items-center justify-center gap-1 rounded-full bg-canvas px-1 py-1">
              <button
                type="button"
                aria-label={t('إنقاص الكمية', 'Decrease quantity')}
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 transition active:scale-90"
              >
                <Minus size={14} />
              </button>
              <span dir="ltr" className="min-w-6 text-center text-sm font-bold">
                {quantity}
              </span>
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
              className="flex min-h-12 flex-1 whitespace-nowrap items-center justify-center gap-2 rounded-2xl bg-brand px-3 py-3 text-sm font-bold text-white shadow-brand transition active:scale-[0.98] disabled:opacity-50"
            >
              <ShoppingBag size={16} className="shrink-0" />
              {t('أضف إلى السلة', 'Add to cart')} ·{' '}
              <span dir="ltr">{formatCurrency(grandTotal)}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
