import { History } from 'lucide-react';
import type { StatusHistoryEntry } from '@/lib/api/types';

const fmt = (value?: string) =>
  value ? new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/**
 * Línea de tiempo de estados de un TC/hallazgo. Los eventos iniciales
 * (from_status NULL) se muestran como "Inicial: <estado>".
 */
export function StatusHistoryTimeline({
  entries,
  title = 'Historial de estados',
}: {
  entries: StatusHistoryEntry[];
  title?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-caption text-fg-subtle">
        Sin cambios de estado registrados todavía.
      </p>
    );
  }

  return (
    <details className="rounded-md border border-border bg-surface-2 px-3 py-2 text-caption">
      <summary className="cursor-pointer select-none font-medium text-fg-muted">
        <History className="mr-1 inline size-3.5" />
        {title} · {entries.length}
      </summary>
      <ol className="mt-2 space-y-1.5">
        {[...entries].reverse().map((entry) => (
          <li key={entry.id} className="rounded-md border border-border bg-surface px-2.5 py-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-fg">
                {entry.from_status ? `${entry.from_status} → ` : 'Inicial: '}
                {entry.to_status}
              </strong>
              {entry.run_name ? (
                <span className="text-fg-subtle">
                  {entry.run_type === 'RETEST' ? '↻ ' : ''}
                  {entry.run_name}
                </span>
              ) : null}
              <span className="text-fg-subtle">
                {entry.changed_by_name ?? '—'} · {fmt(entry.changed_at)}
              </span>
            </div>
            {entry.reason ? <p className="mt-0.5 text-fg-muted">{entry.reason}</p> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
