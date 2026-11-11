import { Bug, FileText, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TestRun } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { historyApi } from '@/lib/api/history';

interface RunRowProps {
  run: TestRun;
  onViewBugs: (run: TestRun) => void;
  onRetest: (run: TestRun) => void;
  isRetesting: boolean;
}

function formatDuration(start?: string | null, end?: string | null): string {
  if (!start || !end) return '—';
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(diff) || diff < 0) return '—';

  const minutes = Math.floor(diff / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  return `${minutes}m ${seconds}s`;
}

const RUN_TYPE_LABEL: Record<string, string> = {
  SMOKE: 'Smoke',
  REGRESSION: 'Regresión',
  INTEGRATION: 'Integración',
  EXPLORATORY: 'Exploratoria',
  RETEST: 'Retest',
  FULL: 'Full',
  INDIVIDUAL: 'Individual',
};

/**
 * Fila de un ciclo finalizado.
 * La barra de stats usa `skipped` (el backend NO devuelve `skip`, ese era un bug del legacy).
 */
export function RunRow({ run, onViewBugs, onRetest, isRetesting }: RunRowProps) {
  const { total, pass, fail, block, skipped, warn } = run.stats;
  const segments = [
    { value: pass, className: 'bg-ok', label: 'PASS' },
    { value: fail, className: 'bg-fail', label: 'FAIL' },
    { value: block, className: 'bg-warn', label: 'BLOCK' },
    { value: skipped, className: 'bg-fg-subtle', label: 'SKIP' },
    { value: warn, className: 'bg-info', label: 'WARN' },
  ];

  const finishedAt = run.finished_at ? new Date(run.finished_at) : null;
  const time = finishedAt
    ? finishedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-2 pl-14 pr-4 hover:bg-fill-soft">
      <span className="w-12 shrink-0 font-mono text-caption text-fg-subtle">#{run.id}</span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-footnote font-medium text-fg">{run.suite_title}</span>
          <Badge tone="neutral">{RUN_TYPE_LABEL[run.run_type ?? ''] ?? run.run_type ?? '—'}</Badge>
        </div>
        <p className="mt-0.5 text-caption text-fg-subtle">
          {time} · {formatDuration(run.started_at, run.finished_at)} ·{' '}
          {run.tester_name ?? 'Sin tester'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex h-1.5 w-24 overflow-hidden rounded-full bg-fill"
          title={segments.map((segment) => `${segment.label}: ${segment.value}`).join(' · ')}
        >
          {total > 0
            ? segments.map((segment) =>
                segment.value > 0 ? (
                  <div
                    key={segment.label}
                    className={cn('h-full', segment.className)}
                    style={{ width: `${(segment.value / total) * 100}%` }}
                  />
                ) : null,
              )
            : null}
        </div>
        <span className="w-8 text-caption font-semibold tabular-nums text-ok">{pass}</span>
        <span className="w-8 text-caption font-semibold tabular-nums text-fail">{fail}</span>
        <span className="w-12 text-caption tabular-nums text-fg-subtle">/{total}</span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Ver reporte"
          title="Ver reporte"
          onClick={() => window.open(historyApi.reportUrl(run.id), '_blank', 'noopener')}
        >
          <FileText />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Ver defectos"
          title="Ver defectos"
          disabled={fail === 0 && block === 0}
          onClick={() => onViewBugs(run)}
        >
          <Bug />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="text-brand"
          onClick={() => onRetest(run)}
          loading={isRetesting}
        >
          <RotateCcw />
          Retest
        </Button>
      </div>
    </div>
  );
}
