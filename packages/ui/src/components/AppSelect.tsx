import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useLanguage } from '../lib';

type Option = { value: string; label: string; disabled: boolean };
function textOf(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : String(child)).join('');
}
function readOptions(children: ReactNode, disabled = false): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>(child)) return [];
    if (child.type === 'option') return [{ value: String(child.props.value ?? textOf(child.props.children)), label: child.props.label ?? textOf(child.props.children), disabled: disabled || !!child.props.disabled }];
    return readOptions(child.props.children, disabled || !!child.props.disabled);
  });
}

/** A native form value with an app-owned, keyboard-accessible choice sheet. */
export function AppSelect({ children, className, style, onChange, onInvalid, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const { t, language } = useLanguage();
  const native = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [localValue, setLocalValue] = useState(String(props.defaultValue ?? ''));
  const options = readOptions(children);
  const value = String(props.value ?? localValue);
  const selected = options.find(option => option.value === value) ?? options[0];
  const filtered = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const title = props['aria-label'] ?? (fieldLabel || t('اختر من القائمة', 'Choose an option'));

  function close() { setOpen(false); trigger.current?.focus(); }
  function choose(option: Option) {
    if (option.disabled || !native.current) return;
    native.current.value = option.value;
    // React receives a real change event with an HTMLSelectElement target.
    native.current.dispatchEvent(new Event('change', { bubbles: true }));
    setLocalValue(option.value);
    close();
  }
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const label = (trigger.current?.labels?.[0] ?? trigger.current?.closest('label'))?.cloneNode(true);
    if (label instanceof HTMLElement) {
      label.querySelectorAll('select, button, input, textarea').forEach(node => node.remove());
      setFieldLabel(label.textContent?.trim() ?? '');
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const target = sheet.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]:not(:disabled)') ?? sheet.current?.querySelector<HTMLElement>('[role="option"]:not(:disabled), input, button');
      target?.focus();
      target?.scrollIntoView({ block: 'nearest' });
    });
    const onNativeBack = (event: Event) => { event.preventDefault(); close(); };
    document.addEventListener('samou:select-back', onNativeBack);
    const onBack = () => setOpen(false);
    window.addEventListener('popstate', onBack);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('popstate', onBack);
      document.removeEventListener('samou:select-back', onNativeBack);
    };
  }, [open]);
  useEffect(() => { if (props.disabled) setOpen(false); }, [props.disabled]);

  return <>
    <select {...props} id={undefined} ref={native} hidden tabIndex={-1} aria-hidden="true" onChange={event => { setLocalValue(event.target.value); onChange?.(event); }} onInvalid={event => { event.preventDefault(); onInvalid?.(event); if (!props.disabled) setOpen(true); }}>{children}</select>
    <button ref={trigger} id={props.id} type="button" className={`sq-select-trigger ${className ?? ''}`} style={style} disabled={props.disabled}
      aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-invalid={props['aria-invalid']} aria-describedby={props['aria-describedby']}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? listId : undefined}
      onClick={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; } if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>
      <span className="sq-select-value">{selected?.label ?? title}</span><ChevronDown size={17} aria-hidden="true" />
    </button>
    {open && createPortal(<div className="sq-choice-backdrop" onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) close(); }}>
      <div ref={sheet} id={listId} role="dialog" aria-modal="true" aria-label={title} dir={language === 'ar' ? 'rtl' : 'ltr'} className="sq-choice-sheet"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
          const buttons = Array.from(sheet.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []);
          const index = buttons.findIndex(button => button === document.activeElement);
          if (index >= 0 && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
          }
          if (event.key === 'Tab') {
            const nodes = Array.from(sheet.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? []);
            const first = nodes[0], last = nodes.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <div className="sq-choice-heading"><h2>{title}</h2><button type="button" onClick={close} aria-label={t('إغلاق قائمة الاختيار', 'Close options')}><X size={20} /></button></div>
        {options.length > 8 && <label className="sq-choice-search"><Search size={18} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('ابحث عن خيار…', 'Search options…')} aria-label={t('البحث في الخيارات', 'Search options')} /></label>}
        <div className="sq-choice-options" role="listbox" aria-label={title}>
          {filtered.map((option, index) => <button type="button" key={`${option.value}-${index}`} role="option" aria-selected={selected?.value === option.value} disabled={option.disabled} onClick={() => choose(option)}>
            <span>{option.label}</span><span className="sq-choice-mark" aria-hidden="true">{selected?.value === option.value && <Check size={16} strokeWidth={3} />}</span>
          </button>)}
          {!filtered.length && <p role="status">{t('لا توجد خيارات مطابقة', 'No matching options')}</p>}
        </div>
      </div>
    </div>, document.body)}
  </>;
}
