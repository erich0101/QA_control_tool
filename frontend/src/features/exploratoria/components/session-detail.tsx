import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bug, ChevronRight, ExternalLink, FileText, Plus, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import type {
  ExploratoryAttachment,
  ExploratoryDetail,
  ExploratoryFlow,
  ExploratoryHallazgo,
  User,
} from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { exploratoriaApi } from '@/lib/api/exploratoria';
import { SelectField } from '@/components/ui/select-field';
import { FlowDetail } from './flow-detail';

interface SessionDetailProps {
  detail: ExploratoryDetail;
  projectId: number | null;
  team: User[];
  isFinishing: boolean;
  isAssigning: boolean;
  canAddHallazgo: boolean;
  onBack: () => void;
  onAddFlow: () => void;
  onAddHallazgo: () => void;
  onFinish: () => void;
  onAssignTester: (tcId: number, userId: number | null) => void;
}

const STATUS_LABEL: Record<string, string> = {
  OK: 'OK',
  FAIL: 'FAIL',
  WARNING: 'WARN',
  BLOCK: 'BLOCK',
  SKIP: 'SKIP',
  PENDING: 'PEND',
};

const STATUS_TONE: Record<string, 'ok' | 'fail' | 'warn' | 'neutral'> = {
  OK: 'ok',
  FAIL: 'fail',
  WARNING: 'warn',
  BLOCK: 'warn',
  SKIP: 'neutral',
  PENDING: 'neutral',
};

export function SessionDetail({
  detail,
  projectId,
  team,
  isFinishing,
  isAssigning,
  canAddHallazgo,
  onBack,
  onAddFlow,
  onAddHallazgo,
  onFinish,
  onAssignTester,
}: SessionDetailProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const { run, flows, executions, defects, attachments, hallazgos = [] } = detail;
  const isFinished = run.status === 'FINISHED';

  const execByTc = new Map(executions.map((exec) => [exec.tc_id, exec]));
  const total = flows.length;

  const counts = { OK: 0, FAIL: 0, WARNING: 0, BLOCK: 0, SKIP: 0, PENDING: 0 };
  for (const flow of flows) {
    const status = (execByTc.get(flow.id)?.status as keyof typeof counts) ?? 'PENDING';
    if (status in counts) counts[status] += 1;
    else counts.PENDING += 1;
  }

  const tested = total - counts.PENDING;
  const progress = total > 0 ? Math.round((tested / total) * 100) : 0;

  const defectsFor = (flow: ExploratoryFlow) => {
    const exec = execByTc.get(flow.id);
    return exec ? defects.filter((defect) => defect.execution_id === exec.id) : [];
  };

  type Row =
    | { kind: 'flow'; rowId: string; flow: ExploratoryFlow }
    | { kind: 'hallazgo'; rowId: string; hallazgo: ExploratoryHallazgo };

  // Hallazgos y flujos conviven en la misma grilla: el hallazgo se identifica
  // con un badge y no participa de las métricas de ejecución.
  const rows: Row[] = [
    ...flows.map((flow) => ({ kind: 'flow' as const, rowId: `flow-${flow.id}`, flow })),
    ...hallazgos.map((hallazgo) => ({
      kind: 'hallazgo' as const,
      rowId: `hallazgo-${hallazgo.id}`,
      hallazgo,
    })),
  ];

  const HALLZGO_STATUS_TONE: Record<string, 'ok' | 'warn' | 'fail' | 'neutral' | 'brand'> = {
    OPEN: 'warn',
    IN_PROGRESS: 'brand',
    FIXED: 'ok',
    CLOSED: 'neutral',
    WONT_FIX: 'neutral',
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-surface px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-caption font-bold text-brand">#{run.id}</span>
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">
            {run.name ?? `Sesión #${run.id}`}
          </h2>

          <Badge tone={isFinished ? 'neutral' : 'ok'}>
            {isFinished ? 'FINALIZADA' : 'EN CURSO'}
          </Badge>

          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Sesiones
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-fail"
            onClick={() => window.open(exploratoriaApi.bugsReportUrl(run.id), '_blank', 'noopener')}
          >
            <FileText />
            Reporte bugs
          </Button>

          {!isFinished ? (
            <>
              <Button variant="secondary" size="sm" onClick={onAddFlow}>
                <Plus />
                Agregar flujo
              </Button>
              {canAddHallazgo ? (
                <Button variant="secondary" size="sm" onClick={onAddHallazgo}>
                  <Bug />
                  Agregar hallazgo
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" className="text-fail" onClick={onFinish} loading={isFinishing}>
                <Square />
                Finalizar sesión
              </Button>
            </>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-3 text-caption text-fg-subtle">
          {run.charter ? <span>📜 {run.charter}</span> : null}
          {run.timebox_minutes ? <span>⏱ {run.timebox_minutes} min</span> : null}
          <span>👤 {run.creator_name ?? '—'}</span>
          {run.started_at ? <span>🟢 {new Date(run.started_at).toLocaleString('es-AR')}</span> : null}
          {run.finished_at ? (
            <span>🏁 {new Date(run.finished_at).toLocaleString('es-AR')}</span>
          ) : null}
        </div>
      </header>

      {total > 0 || hallazgos.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border bg-surface-2 px-5 py-2">
          {total > 0 ? (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-fill">
                <div
                  className={cn('h-full rounded-full', progress === 100 ? 'bg-ok' : 'bg-brand')}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-caption tabular-nums text-fg-muted">
                {progress}% ({tested}/{total})
              </span>
            </div>
          ) : null}

          {(['OK', 'FAIL', 'WARNING', 'BLOCK', 'SKIP', 'PENDING'] as const).map((status) =>
            counts[status] > 0 ? (
              <Badge key={status} tone={STATUS_TONE[status]}>
                {STATUS_LABEL[status]} {counts[status]}
              </Badge>
            ) : null,
          )}

          {hallazgos.length > 0 ? (
            <Badge tone="brand">
              <Bug className="size-3" />
              {hallazgos.length} hallazgo{hallazgos.length === 1 ? '' : 's'}
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-5">
        {rows.length === 0 ? (
          <EmptyState
            icon={<ChevronRight />}
            title="Sesión sin flujos"
            description="Agregá el primer flujo para empezar a explorar, o cargá un hallazgo."
            action={
              !isFinished ? (
                <div className="flex gap-2">
                  <Button variant="primary" onClick={onAddFlow}>
                    <Plus />
                    Agregar flujo
                  </Button>
                  {canAddHallazgo ? (
                    <Button variant="secondary" onClick={onAddHallazgo}>
                      <Bug />
                      Agregar hallazgo
                    </Button>
                  ) : null}
                </div>
              ) : undefined
            }
          />
        ) : (
          <DataTable<Row>
            columns={[
              {
                id: 'key',
                header: 'Key',
                headerClassName: 'w-28',
                cell: (row) => (
                  <span className="flex items-center gap-1.5 font-mono text-caption font-bold text-brand">
                    <ChevronRight
                      className={cn(
                        'size-3 transition-transform',
                        expandedRowId === row.rowId && 'rotate-90',
                      )}
                    />
                    {row.kind === 'flow'
                      ? (row.flow.key_id ?? `#${row.flow.id}`)
                      : `H-${row.hallazgo.id}`}
                  </span>
                ),
              },
              {
                id: 'title',
                header: 'Flujo / Hallazgo',
                cell: (row) => (
                  <span className="flex items-center gap-2 font-medium text-fg">
                    {row.kind === 'hallazgo' ? (
                      <Badge tone="brand" className="shrink-0">
                        HALLAZGO
                      </Badge>
                    ) : null}
                    <span className="truncate">
                      {row.kind === 'flow' ? row.flow.title : row.hallazgo.title}
                    </span>
                  </span>
                ),
              },
              {
                id: 'status',
                header: 'Status',
                headerClassName: 'w-24',
                cell: (row) => {
                  if (row.kind === 'hallazgo') {
                    return (
                      <Badge tone={HALLZGO_STATUS_TONE[row.hallazgo.status] ?? 'neutral'}>
                        {row.hallazgo.status}
                      </Badge>
                    );
                  }
                  const status = execByTc.get(row.flow.id)?.status ?? 'PENDING';
                  return (
                    <Badge tone={STATUS_TONE[status] ?? 'neutral'}>
                      {STATUS_LABEL[status] ?? status}
                    </Badge>
                  );
                },
              },
              {
                id: 'tester',
                header: 'Tester',
                headerClassName: 'w-40',
                cellClassName: 'text-caption text-fg-muted',
                cell: (row) => {
                  if (row.kind === 'hallazgo') {
                    return (
                      row.hallazgo.assignee_name ??
                      row.hallazgo.reporter_name ??
                      '—'
                    );
                  }

                  const flow = row.flow;
                  const exec = execByTc.get(flow.id);
                  const isPending = !exec || exec.status === 'PENDING';
                  const assignee = team.find((user) => user.id === flow.assigned_to);

                  // Flujos pendientes: el tester se asigna desde acá (como en el
                  // legacy) y el backend lo usa al ejecutar el flujo.
                  if (!isFinished && isPending) {
                    return (
                      <div onClick={(event) => event.stopPropagation()}>
                        <SelectField
                          value={flow.assigned_to ? String(flow.assigned_to) : ''}
                          onValueChange={(value) =>
                            onAssignTester(flow.id, value ? Number(value) : null)
                          }
                          allowEmpty
                          placeholder="— Sin asignar —"
                          disabled={isAssigning}
                          aria-label={`Tester de ${flow.key_id ?? `#${flow.id}`}`}
                          className="h-7 text-caption"
                          options={team.map((user) => ({
                            value: String(user.id),
                            label: user.name,
                          }))}
                        />
                      </div>
                    );
                  }

                  return exec?.tester ?? assignee?.name ?? '—';
                },
              },
              {
                id: 'executed',
                header: 'Fecha',
                headerClassName: 'w-36',
                cellClassName: 'text-caption text-fg-subtle',
                cell: (row) => {
                  const raw =
                    row.kind === 'flow'
                      ? execByTc.get(row.flow.id)?.executed_at
                      : row.hallazgo.created_at;
                  return raw
                    ? new Date(raw).toLocaleString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—';
                },
              },
            ]}
            rows={rows}
            getRowId={(row) => row.rowId}
            onRowClick={(row) =>
              setExpandedRowId((current) => (current === row.rowId ? null : row.rowId))
            }
            activeRowId={expandedRowId}
            expandedRowId={expandedRowId}
            renderExpanded={(row) =>
              row.kind === 'flow' ? (
                <FlowDetail
                  flow={row.flow}
                  execution={execByTc.get(row.flow.id)}
                  defects={defectsFor(row.flow)}
                  attachments={attachments as ExploratoryAttachment[]}
                  runId={run.id}
                  isFinished={isFinished}
                  projectId={projectId}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        row.hallazgo.severity === 'Crítica' || row.hallazgo.severity === 'Alta'
                          ? 'fail'
                          : row.hallazgo.severity === 'Baja'
                            ? 'ok'
                            : 'warn'
                      }
                    >
                      {row.hallazgo.severity ?? 'Media'}
                    </Badge>
                    <span className="text-caption text-fg-subtle">
                      Reportado por {row.hallazgo.reporter_name ?? '—'}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-footnote text-fg-muted">
                    {row.hallazgo.description?.trim() || 'Sin descripción.'}
                  </p>
                  <Button variant="secondary" size="sm" asChild>
                    <Link to={`/hallazgos?id=${row.hallazgo.id}`}>
                      Abrir en Hallazgos
                      <ExternalLink />
                    </Link>
                  </Button>
                </div>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
