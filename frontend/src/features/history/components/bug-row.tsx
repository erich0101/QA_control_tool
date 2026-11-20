import { useState } from 'react';
import { ChevronRight, Rocket, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReadField } from '@/components/ui/read-field';
import { SelectField } from '@/components/ui/select-field';
import type { Defect } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useDefectStatusHistory } from '@/features/execution/use-status-history';
import { StatusHistoryTimeline } from '@/features/execution/components/status-history-timeline';
import { JiraTicketDialog } from '@/features/jira-tickets/jira-ticket-dialog';
import { JiraTraceBadge } from '@/features/jira-tickets/jira-trace-badge';
import { useUiStore } from '@/stores/ui';

interface BugRowProps {
  bug: Defect;
  onDismiss: (bug: Defect) => void;
  onSetStatus: (bug: Defect, status: string) => void;
  isBusy: boolean;
}

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'WONT_FIX', 'DISMISSED'].map(
  (value) => ({ value, label: value }),
);

const SEVERITY_TONE: Record<string, 'fail' | 'warn' | 'ok'> = {
  Crítica: 'fail',
  Alta: 'fail',
  Media: 'warn',
  Baja: 'ok',
};

export function BugRow({ bug, onDismiss, onSetStatus, isBusy }: BugRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [jiraOpen, setJiraOpen] = useState(false);
  const projectId = useUiStore((state) => state.activeProjectId);
  const { data: statusHistory = [] } = useDefectStatusHistory(bug.id, expanded);
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

        <div className="w-32 shrink-0">
          <SelectField
            value={bug.status ?? 'OPEN'}
            onValueChange={(status) => onSetStatus(bug, status)}
            options={STATUS_OPTIONS}
            aria-label="Estado del bug"
            disabled={isBusy}
          />
        </div>

        <JiraTraceBadge
          jiraKey={bug.jira_key}
          jiraUrl={bug.jira_url}
          jiraStatus={bug.jira_status}
        />

        <span className="w-12 shrink-0 text-right text-caption tabular-nums text-fg-subtle">
          {createdAt}
        </span>

        {bug.jira_key ? null : (
          <Button
            variant="secondary"
            size="sm"
            disabled={isDismissed}
            title={
              isDismissed
                ? 'El bug está descartado: reabrilo para exportarlo a Jira'
                : 'Crear un ticket de error en Jira a partir de este bug'
            }
            onClick={() => setJiraOpen(true)}
          >
            <Rocket />
            Crear ticket Jira
          </Button>
        )}

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
          {bug.description ? <ReadField label="Descripción" value={bug.description} /> : null}
          {bug.steps_to_reproduce ? (
            <ReadField label="Pasos para reproducir" value={bug.steps_to_reproduce} mono />
          ) : null}
          {bug.expected_result ? (
            <ReadField label="Resultado esperado" value={bug.expected_result} />
          ) : null}
          {bug.actual_result ? (
            <ReadField label="Resultado real" value={bug.actual_result} />
          ) : null}
          {bug.frequency ? <ReadField label="Frecuencia" value={bug.frequency} /> : null}
          {bug.business_impact ? (
            <ReadField label="Impacto de negocio" value={bug.business_impact} />
          ) : null}
          {bug.observations ? (
            <ReadField label="Observaciones" value={bug.observations} />
          ) : null}

          <div className="md:col-span-2">
            <StatusHistoryTimeline entries={statusHistory} title="Historial del bug" />
          </div>

          <div className="md:col-span-2 flex flex-wrap gap-4 border-t border-border pt-2 text-caption text-fg-subtle">
            <span>TC: {bug.tc_key ?? '—'}</span>
            <span>Test: {bug.tc_title ?? '—'}</span>
            <span>Tester: {bug.tester_name ?? '—'}</span>
            <span>Run: {bug.run_id ? `#${bug.run_id}` : '—'}</span>
          </div>
        </div>
      ) : null}

      <JiraTicketDialog
        open={jiraOpen}
        onOpenChange={setJiraOpen}
        projectId={projectId}
        kind="defect"
        items={[
          {
            id: bug.id,
            title: bug.title || 'Sin título',
            severity: bug.severity,
            jira_key: bug.jira_key,
          },
        ]}
      />
    </div>
  );
}
