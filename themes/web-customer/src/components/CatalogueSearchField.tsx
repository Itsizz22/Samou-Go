import { useId, useRef } from 'react';
import { Search, X } from 'lucide-react';
export function CatalogueSearchField({ value, onChange, onSearch }: { value: string; onChange: (value: string) => void; onSearch: () => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return <form role="search" aria-label="البحث في المتاجر والمنتجات" onSubmit={event => { event.preventDefault(); onSearch(); input.current?.blur(); }}>
    <label htmlFor={id} className="mb-2 block text-sm font-bold text-ink">عن ماذا تبحث اليوم؟</label>
    <div className="flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 shadow-card transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
      <Search aria-hidden="true" className="ms-2 size-5 shrink-0 text-brand" />
      <input ref={input} id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={120} enterKeyHint="search" autoComplete="off"
        placeholder="اسم متجر أو منتج…" aria-label="ابحث عن متجر أو منتج"
        className="min-h-11 min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none ring-0 placeholder:text-ink-muted focus:outline-none focus:ring-0" />
      {value && <button type="button" aria-label="مسح البحث" onClick={() => { onChange(''); input.current?.focus(); }} className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-canvas focus-visible:ring-2 focus-visible:ring-brand"><X size={18} /></button>}
      <button type="submit" className="min-h-11 shrink-0 rounded-xl bg-brand px-3 text-sm font-bold text-white hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">بحث</button>
    </div>
  </form>;
}
