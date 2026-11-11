import { useState } from 'react';
import { ChevronRight, ExternalLink, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Defect } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface BugRowProps {
  bug: Defect;
  onDismiss: (bug: Defect) => void;
  isBusy: boolean;
}

const SEVERITY_TONE: Record<string, 'fail' | 'warn' | 'ok'> = {
  Crítica: 'fail',
  Alta: 'fail',
  Media: 'warn',
  Baja: 'ok',
};

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'neutral'> = {
  FIXED: 'ok',
  OPEN: 'warn',
  DISMISSED: 'neutral',
};

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-caption font-bold uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="whitespace-pre-wrap text-footnote text-fg">{value}</p>
    </div>
  );
}

export function BugRow({ bug, onDismiss, isBusy }: BugRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isDismissed = bug.status === 'DISMISSED';

  const createdAt = bug.created_at
    ? new Date(bug.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    : '—';

  return (
    <div className={cn('border-b border-border', isDismissed && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-3 py-2 pl-14 pr-4 hover:bg-fill-soft">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn('size-3.5 shrink-0 text-fg-subtle transition-transform', expanded && 'rotate-90')}
          />
          <span className="shrink-0 font-mono text-caption text-fg-subtle">#{bug.id}</span>
          <span
            className={cn(
              'truncate text-footnote font-medium text-fg',
              isDismissed && 'line-through',
            )}
          >
            {bug.title || 'Sin título'}
          </span>
        </button>

        <Badge tone={SEVERITY_TONE[bug.severity ?? 'Media'] ?? 'warn'}>
          {bug.severity ?? 'Media'}
        </Badge>

        {bug.jira_key ? (
          <a
            href={bug.jira_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-caption font-semibold text-brand hover:underline"
          >
            {bug.jira_key}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <Badge tone={STATUS_TONE[bug.status ?? 'OPEN'] ?? 'neutral'}>{bug.status ?? 'OPEN'}</Badge>
        )}

        {bug.jira_status ? (
          <span className="text-caption text-fg-subtle">{bug.jira_status}</span>
        ) : null}

        <span className="w-12 shrink-0 text-right text-caption tabular-nums text-fg-subtle">
          {createdAt}
        </span>

        <Button
          variant="ghost"
          size="sm"
          className={isDismissed ? 'text-ok' : 'text-fail'}
          disabled={isBusy}
          onClick={() => onDismiss(bug)}
        >
          {isDismissed ? <RotateCcw /> : <Trash2 />}
          {isDismissed ? 'Reabrir' : 'Descartar'}
        </Button>
      </div>

      {expanded ? (
        <div className="grid gap-3 border-t border-border bg-surface-2 px-14 py-3 md:grid-cols-2">
          <DetailRow label="Descripción" value={bug.description} />
          <DetailRow label="Pasos para reproducir" value={bug.steps_to_reproduce} />
          <DetailRow label="Resultado esperado" value={bug.expected_result} />
          <DetailRow label="Resultado real" value={bug.actual_result} />
          <DetailRow label="Frecuencia" value={bug.frequency} />
          <DetailRow label="Impacto de negocio" value={bug.business_impact} />
          <DetailRow label="Observaciones" value={bug.observations} />

          <div className="md:col-span-2 flex flex-wrap gap-4 border-t border-border pt-2 text-caption text-fg-subtle">
            <span>TC: {bug.tc_key ?? '—'}</span>
            <span>Test: {bug.tc_title ?? '—'}</span>
            <span>Tester: {bug.tester_name ?? '—'}</span>
            <span>Run: {bug.run_id ? `#${bug.run_id}` : '—'}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
