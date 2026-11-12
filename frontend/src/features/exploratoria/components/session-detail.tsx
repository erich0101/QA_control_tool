import { useState } from 'react';
import {
  Bug,
  ChevronRight,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  Square,
  Ticket,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { ReadField } from '@/components/ui/read-field';
import type {
  ExploratoryAttachment,
  ExploratoryDetail,
  ExploratoryFlow,
  ExploratoryHallazgo,
  User,
} from '@/lib/api/types';
import { HALLZGO_STATUSES } from '@/lib/api/types';
import { EXPLORATORY_STATUSES } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { SelectField } from '@/components/ui/select-field';
import { JiraTicketDialog } from '@/features/jira-tickets/jira-ticket-dialog';
import { BugsReportDialog } from './bugs-report-dialog';
import { FlowDetail } from './flow-detail';

interface SessionDetailProps {
  detail: ExploratoryDetail;
  projectId: number | null;
  team: User[];
  isFinishing: boolean;
  isAssigning: boolean;
  isHallazgoPending: boolean;
  isFlowPending: boolean;
  canDelete: boolean;
  canAddHallazgo: boolean;
  onBack: () => void;
  onAddFlow: () => void;
  onAddHallazgo: () => void;
  onFinish: () => void;
  onAssignTester: (tcId: number, userId: number | null) => void;
  onHallazgoStatus: (id: number, status: string) => void;
  onHallazgoAssign: (id: number, userId: number | null) => void;
  onEditFlow: (flow: ExploratoryFlow) => void;
  onDeleteFlow: (flow: ExploratoryFlow) => void;
  onEditHallazgo: (hallazgo: ExploratoryHallazgo) => void;
  onDeleteHallazgo: (hallazgo: ExploratoryHallazgo) => void;
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
  isHallazgoPending,
  isFlowPending,
  canDelete,
  canAddHallazgo,
  onBack,
  onAddFlow,
  onAddHallazgo,
  onFinish,
  onAssignTester,
  onHallazgoStatus,
  onHallazgoAssign,
  onEditFlow,
  onDeleteFlow,
  onEditHallazgo,
  onDeleteHallazgo,
}: SessionDetailProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [jiraHallazgoId, setJiraHallazgoId] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const { run, flows, executions, defects, attachments, hallazgos = [] } = detail;
  const isFinished = run.status === 'FINISHED';
  const jiraHallazgo = hallazgos.find((hallazgo) => hallazgo.id === jiraHallazgoId) ?? null;

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

  // ── Filtros (tipo, estado y tester) ─────────────────────────
  const FLOW_STATUSES = [...EXPLORATORY_STATUSES, 'PENDING'];
  const [typeFilter, setTypeFilter] = useState<'all' | 'flow' | 'hallazgo'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [testerFilter, setTesterFilter] = useState('all');

  const testerName = (row: Row) =>
    row.kind === 'flow'
      ? (execByTc.get(row.flow.id)?.tester ??
        team.find((user) => user.id === row.flow.assigned_to)?.name ??
        '')
      : (row.hallazgo.assignee_name ?? row.hallazgo.reporter_name ?? '');

  const statusOf = (row: Row) =>
    row.kind === 'flow' ? (execByTc.get(row.flow.id)?.status ?? 'PENDING') : row.hallazgo.status;

  const statusOptions =
    typeFilter === 'flow'
      ? FLOW_STATUSES
      : typeFilter === 'hallazgo'
        ? [...HALLZGO_STATUSES]
        : [...FLOW_STATUSES, ...HALLZGO_STATUSES];

  // Los testers disponibles dependen del tipo elegido (TC vs hallazgo).
  const scopedRows = typeFilter === 'all' ? rows : rows.filter((row) => row.kind === typeFilter);
  const testerNames = [...new Set(scopedRows.map(testerName).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const hasUnassigned = scopedRows.some((row) => !testerName(row));
  const filtersActive =
    typeFilter !== 'all' || statusFilter !== 'all' || testerFilter !== 'all';

  const filteredRows = rows.filter((row) => {
    if (typeFilter !== 'all' && row.kind !== typeFilter) return false;
    if (statusFilter !== 'all' && statusOf(row) !== statusFilter) return false;
    if (testerFilter === '__none__') return !testerName(row);
    if (testerFilter !== 'all' && testerName(row) !== testerFilter) return false;
    return true;
  });

  const changeType = (value: string) => {
    const next = value as typeof typeFilter;
    setTypeFilter(next);
    const allowed =
      next === 'flow'
        ? FLOW_STATUSES
        : next === 'hallazgo'
          ? [...HALLZGO_STATUSES]
          : [...FLOW_STATUSES, ...HALLZGO_STATUSES];
    if (statusFilter !== 'all' && !allowed.includes(statusFilter)) setStatusFilter('all');
    // La lista de testers cambia con el tipo: evitamos un filtro inválido.
    setTesterFilter('all');
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
    setTesterFilter('all');
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
            onClick={() => setReportOpen(true)}
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

      {rows.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-5 py-2">
          <span className="mr-1 text-caption font-semibold uppercase tracking-wide text-fg-subtle">
            Filtros
          </span>

          <SelectField
            value={typeFilter}
            onValueChange={changeType}
            allowEmpty={false}
            aria-label="Filtrar por tipo"
            className="h-8 w-32 text-footnote"
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'flow', label: 'TC' },
              { value: 'hallazgo', label: 'Hallazgos' },
            ]}
          />

          <SelectField
            value={statusFilter}
            onValueChange={setStatusFilter}
            aria-label="Filtrar por estado"
            className="h-8 w-40 text-footnote"
            options={[
              { value: 'all', label: 'Todos los estados' },
              ...statusOptions.map((status) => ({ value: status, label: status })),
            ]}
          />

          <SelectField
            value={testerFilter}
            onValueChange={setTesterFilter}
            aria-label="Filtrar por tester"
            className="h-8 w-44 text-footnote"
            options={[
              { value: 'all', label: 'Todos los testers' },
              ...(hasUnassigned ? [{ value: '__none__', label: '— Sin asignar —' }] : []),
              ...testerNames.map((name) => ({ value: name, label: name })),
            ]}
          />

          {filtersActive ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpiar
            </Button>
          ) : null}

          <span className="ml-auto text-caption text-fg-subtle">
            {filteredRows.length} de {rows.length}
          </span>
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
              {
                id: 'actions',
                header: '',
                headerClassName: 'w-20',
                cellClassName: 'text-right',
                cell: (row) => {
                  if (isFinished) return null;

                  const busy = row.kind === 'flow' ? isFlowPending : isHallazgoPending;
                  const executed =
                    row.kind === 'flow' &&
                    (execByTc.get(row.flow.id)?.status ?? 'PENDING') !== 'PENDING';
                  const canRemove = canDelete && !executed && !busy;
                  const label =
                    row.kind === 'flow'
                      ? (row.flow.key_id ?? `#${row.flow.id}`)
                      : `#${row.hallazgo.id}`;

                  const edit = () => {
                    if (row.kind === 'flow') onEditFlow(row.flow);
                    else onEditHallazgo(row.hallazgo);
                  };
                  const remove = () => {
                    if (row.kind === 'flow') onDeleteFlow(row.flow);
                    else onDeleteHallazgo(row.hallazgo);
                  };

                  return (
                    <div
                      className="flex justify-end gap-1"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${label}`}
                        title="Editar"
                        disabled={busy}
                        onClick={edit}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-fail"
                        aria-label={`Eliminar ${label}`}
                        title={
                          executed
                            ? 'El flujo ya tiene ejecución: no se puede eliminar'
                            : !canDelete
                              ? 'Requiere rol Admin o Analista QA'
                              : 'Eliminar'
                        }
                        disabled={!canRemove}
                        onClick={remove}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  );
                },
              },
            ]}
            rows={filteredRows}
            getRowId={(row) => row.rowId}
            onRowClick={(row) =>
              setExpandedRowId((current) => (current === row.rowId ? null : row.rowId))
            }
            activeRowId={expandedRowId}
            expandedRowId={expandedRowId}
            emptyMessage="Sin resultados para los filtros aplicados."
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
                <div className="space-y-3">
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
                    {row.hallazgo.jira_key ? (
                      <Button variant="ghost" size="sm" asChild className="text-brand">
                        <a
                          href={row.hallazgo.jira_url ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.hallazgo.jira_key}
                          <ExternalLink />
                        </a>
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Estado</Label>
                      <SelectField
                        value={row.hallazgo.status}
                        onValueChange={(status) => onHallazgoStatus(row.hallazgo.id, status)}
                        options={HALLZGO_STATUSES.map((value) => ({ value, label: value }))}
                        disabled={isHallazgoPending}
                        aria-label={`Estado del hallazgo #${row.hallazgo.id}`}
                        className="h-8 text-footnote"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Asignado a</Label>
                      <SelectField
                        value={
                          row.hallazgo.assigned_to ? String(row.hallazgo.assigned_to) : ''
                        }
                        onValueChange={(value) =>
                          onHallazgoAssign(row.hallazgo.id, value ? Number(value) : null)
                        }
                        allowEmpty
                        placeholder="— Sin asignar —"
                        options={team.map((user) => ({
                          value: String(user.id),
                          label: user.name,
                        }))}
                        disabled={isHallazgoPending}
                        aria-label={`Asignado del hallazgo #${row.hallazgo.id}`}
                        className="h-8 text-footnote"
                      />
                    </div>
                  </div>

                  <ReadField label="Descripción" value={row.hallazgo.description} />
                  <ReadField
                    label="Pasos para reproducir"
                    value={row.hallazgo.steps_to_reproduce}
                    mono
                  />
                  <ReadField label="Resultado esperado" value={row.hallazgo.expected_result} />
                  <ReadField label="Resultado obtenido" value={row.hallazgo.actual_result} />

                  {row.hallazgo.jira_key ? null : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setJiraHallazgoId(row.hallazgo.id)}
                    >
                      <Ticket />
                      Crear ticket en Jira
                    </Button>
                  )}
                </div>
              )
            }
          />
        )}
      </div>

      <JiraTicketDialog
        open={jiraHallazgo != null}
        onOpenChange={(open) => {
          if (!open) setJiraHallazgoId(null);
        }}
        projectId={projectId}
        kind="hallazgo"
        items={
          jiraHallazgo
            ? [
                {
                  id: jiraHallazgo.id,
                  title: jiraHallazgo.title,
                  severity: jiraHallazgo.severity,
                  jira_key: jiraHallazgo.jira_key,
                },
              ]
            : []
        }
      />

      <BugsReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        runId={run.id}
        runName={run.name}
        executions={executions}
      />
    </div>
  );
}
