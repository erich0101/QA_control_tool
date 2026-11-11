import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DateRangeFilterProps {
  idPrefix: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onClear: () => void;
  shown: number;
  total: number;
  unit: string;
}

export function DateRangeFilter({
  idPrefix,
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
  shown,
  total,
  unit,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-fill-soft px-4 py-2">
      <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
        Periodo
      </span>

      <Input
        id={`${idPrefix}-from`}
        type="date"
        value={from}
        onChange={(event) => onFromChange(event.target.value)}
        className="h-8 w-36 text-caption"
        aria-label="Fecha desde"
      />
      <span className="text-caption text-fg-subtle">→</span>
      <Input
        id={`${idPrefix}-to`}
        type="date"
        value={to}
        onChange={(event) => onToChange(event.target.value)}
        className="h-8 w-36 text-caption"
        aria-label="Fecha hasta"
      />

      <Button variant="ghost" size="sm" onClick={onClear} disabled={!from && !to}>
        Limpiar
      </Button>

      <span className="ml-auto text-caption text-fg-subtle">
        {shown} de {total} {unit}
      </span>
    </div>
  );
}
