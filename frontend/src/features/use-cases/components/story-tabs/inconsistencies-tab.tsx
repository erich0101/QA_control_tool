import { AlertTriangle, CheckCircle2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { Inconsistency } from '@/lib/api/types';
import { SeverityDot } from '../story-badges';

interface InconsistenciesTabProps {
  inconsistencies: Inconsistency[];
  onResolve: (inconsistency: Inconsistency) => void;
  isResolving?: boolean;
}

export function InconsistenciesTab({
  inconsistencies,
  onResolve,
  isResolving,
}: InconsistenciesTabProps) {
  const count = inconsistencies.length;

  return (
    <div className="space-y-3">
      <div
        className={
          count > 0
            ? 'flex items-center gap-2 rounded-md border-l-4 border-warn bg-warn-soft px-4 py-3'
            : 'flex items-center gap-2 rounded-md border-l-4 border-ok bg-ok-soft px-4 py-3'
        }
      >
        {count > 0 ? (
          <AlertTriangle className="size-4 text-warn" />
        ) : (
          <CheckCircle2 className="size-4 text-ok" />
        )}
        <span
          className={
            count > 0
              ? 'text-caption font-bold uppercase tracking-wide text-warn'
              : 'text-caption font-bold uppercase tracking-wide text-ok'
          }
        >
          {count > 0 ? `Inconsistencias detectadas (${count})` : 'Sin inconsistencias — HU consistente'}
        </span>
      </div>

      {count === 0 ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title="Nada pendiente"
          description="Cuando se detecten inconsistencias en el análisis aparecerán acá."
        />
      ) : (
        <ul className="space-y-1.5">
          {inconsistencies.map((item) => (
            <li
              key={item.id}
              className="group flex items-start gap-3 rounded-md bg-fill-soft px-3 py-2"
            >
              <SeverityDot severity={item.severity} />
              <div className="min-w-0 flex-1">
                <p className="text-footnote leading-snug text-fg">{item.title}</p>
                {item.description ? (
                  <p className="mt-0.5 text-caption text-fg-muted">{item.description}</p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-ok opacity-60 transition-opacity group-hover:opacity-100"
                title="Resolver inconsistencia"
                aria-label="Resolver inconsistencia"
                disabled={isResolving}
                onClick={() => onResolve(item)}
              >
                <Check />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
