import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string | null;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * Selector con búsqueda (combobox) sin dependencias externas.
 * Se usa cuando la lista es larga y un <SelectField> obligaría a scrollear.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin resultados',
  disabled,
  className,
  id,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ''}`.toLowerCase().includes(term),
    );
  }, [options, query]);

  const choose = (option: ComboboxOption) => {
    if (option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="none"
        aria-label={aria['aria-label']}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-sm text-fg shadow-apple-sm transition-colors',
          'hover:bg-fill-soft focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !selected && 'text-fg-subtle',
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" />
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-apple-lg">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search className="size-3.5 shrink-0 text-fg-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-6 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            />
          </div>

          <ul role="listbox" className="scrollbar-apple max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-2 text-footnote text-fg-subtle">{emptyText}</li>
            ) : (
              filtered.map((option) => {
                const isSelected = option.value === value;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onClick={() => choose(option)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left text-footnote transition-colors',
                        'hover:bg-fill-soft disabled:cursor-not-allowed disabled:opacity-50',
                        isSelected && 'bg-brand-soft text-fg',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{option.label}</span>
                        {option.description ? (
                          <span className="block truncate text-caption text-fg-subtle">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                      {isSelected ? <Check className="mt-0.5 size-3.5 shrink-0 text-brand" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
