import { useState } from 'react';
import { ChevronRight, Plus, Check, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Inconsistency } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface InconsistenciesPanelProps {
  inconsistencies: Inconsistency[];
  onResolve: (inconsistency: Inconsistency) => void;
  onAdd: () => void;
  isBusy?: boolean;
}

const SEVERITY_TONE = {
  Alta: 'fail',
  Media: 'warn',
  Baja: 'ok',
} as const;

export function InconsistenciesPanel({
  inconsistencies,
  onResolve,
  onAdd,
  isBusy,
}: InconsistenciesPanelProps) {
  const [open, setOpen] = useState(false);

  const counts = {
    Alta: inconsistencies.filter((item) => item.severity === 'Alta').length,
    Media: inconsistencies.filter((item) => item.severity === 'Media').length,
    Baja: inconsistencies.filter((item) => item.severity === 'Baja').length,
  };

  return (
    <section className="shrink-0 border-b border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-fill-soft"
      >
        <ChevronRight
          className={cn('size-3.5 text-fg-subtle transition-transform', open && 'rotate-90')}
        />
        <TriangleAlert className="size-3.5 text-warn" />
        <span className="text-caption font-bold uppercase tracking-wide text-fg">
          Inconsistencias
        </span>
        <span className="text-caption text-fg-subtle">{inconsistencies.length} total</span>

        <span className="ml-2 flex gap-1.5">
          {(['Alta', 'Media', 'Baja'] as const).map((severity) =>
            counts[severity] > 0 ? (
              <Badge key={severity} tone={SEVERITY_TONE[severity]}>
                {counts[severity]} {severity}
              </Badge>
            ) : null,
          )}
        </span>
      </button>

      {open ? (
        <div className="space-y-2 border-t border-border px-5 py-3">
          {inconsistencies.length === 0 ? (
            <p className="text-footnote text-fg-subtle">Sin inconsistencias registradas.</p>
          ) : (
            <ul className="space-y-1.5">
              {inconsistencies.map((item) => (
                <li
                  key={item.id}
                  className="group flex items-start gap-3 rounded-md border border-border bg-surface-2 px-3 py-2"
                >
                  <Badge tone={SEVERITY_TONE[item.severity ?? 'Alta']} className="mt-0.5 shrink-0">
                    {item.severity ?? 'Alta'}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-footnote font-medium text-fg">{item.title}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-caption leading-relaxed text-fg-muted">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-ok opacity-70 group-hover:opacity-100"
                    disabled={isBusy}
                    onClick={() => onResolve(item)}
                  >
                    <Check />
                    Resolver
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start border border-dashed border-border text-fg-muted"
            onClick={onAdd}
          >
            <Plus />
            Agregar inconsistencia
          </Button>
        </div>
      ) : null}
    </section>
  );
}
