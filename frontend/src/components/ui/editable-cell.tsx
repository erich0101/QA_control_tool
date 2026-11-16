import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { Button } from './button';
import { Input, Textarea } from './input';
import { cn } from '@/lib/utils';

interface EditableCellProps {
  value: string;
  onSave: (value: string) => void | Promise<void>;
  multiline?: boolean;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  inputType?: 'text' | 'number';
  className?: string;
}

/**
 * Celda editable para usar dentro de `DataTable`.
 * Muestra el valor; al hacer clic en el lápiz abre el input/textarea y guarda
 * con check (o Enter). Escape cancela.
 */
export function EditableCell({
  value,
  onSave,
  multiline = false,
  placeholder,
  emptyText = '—',
  disabled,
  inputType = 'text',
  className,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const save = async () => {
    const next = draft.trim();
    if (next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span className={cn('inline-flex min-w-0 max-w-full items-center gap-1.5', className)}>
        <span className={cn('truncate', !value && 'text-fg-subtle')}>{value || emptyText}</span>
        {!disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0"
            onClick={start}
            aria-label="Editar valor"
            title="Editar"
          >
            <Pencil />
          </Button>
        ) : null}
      </span>
    );
  }

  return (
    <span className={cn('flex items-start gap-1', className)}>
      {multiline ? (
        <Textarea
          autoFocus
          value={draft}
          placeholder={placeholder}
          className="min-h-16 text-footnote"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel();
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save();
          }}
        />
      ) : (
        <Input
          autoFocus
          type={inputType}
          value={draft}
          placeholder={placeholder}
          className="h-8 text-footnote"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel();
            if (event.key === 'Enter') void save();
          }}
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-7 shrink-0 text-ok"
        onClick={() => void save()}
        loading={saving}
        aria-label="Guardar valor"
        title="Guardar"
      >
        <Check />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-7 shrink-0 text-fail"
        onClick={cancel}
        aria-label="Cancelar edición"
        title="Cancelar"
      >
        <X />
      </Button>
    </span>
  );
}
