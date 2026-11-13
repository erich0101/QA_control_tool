import { History } from 'lucide-react';
import type { StatusHistoryEntry } from '@/lib/api/types';

const fmt = (value?: string) =>
  value ? new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/**
 * Histórico de estados de un TC, hallazgo o bug.
 *
 * Muestra una línea compacta con el último estado (por ejemplo `FAIL → OK`)
 * y deja el detalle completo colapsado, para que al revisar un re-test no
 * invada la vista con todos los eventos.
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

  // El backend devuelve los eventos del más reciente al más antiguo.
  const latest = entries[0];
  const latestLabel = latest.from_status
    ? `${latest.from_status} → ${latest.to_status}`
    : `Inicial: ${latest.to_status}`;

  return (
    <div className="rounded-md border border-border bg-surface-2 text-caption">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        <History className="size-3.5 shrink-0 text-fg-subtle" />
        <span className="font-medium text-fg-muted">{title}</span>
        <span className="text-fg-subtle">
          · {entries.length} cambio{entries.length === 1 ? '' : 's'}
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="rounded-full bg-fill-soft px-2 py-0.5 font-semibold text-fg">
            {latestLabel}
          </span>
          <span className="text-fg-subtle">{fmt(latest.changed_at)}</span>
        </span>
      </div>

      <details className="border-t border-border px-3 py-1.5">
        <summary className="cursor-pointer select-none text-fg-subtle">
          Ver histórico completo
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
    </div>
  );
}
