import { useState } from 'react';
import { ChevronRight, FileText, Plus, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type {
  ExploratoryAttachment,
  ExploratoryDetail,
  ExploratoryFlow,
} from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { exploratoriaApi } from '@/lib/api/exploratoria';
import { FlowDetail } from './flow-detail';

interface SessionDetailProps {
  detail: ExploratoryDetail;
  projectId: number | null;
  isFinishing: boolean;
  onBack: () => void;
  onAddFlow: () => void;
  onFinish: () => void;
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
  isFinishing,
  onBack,
  onAddFlow,
  onFinish,
}: SessionDetailProps) {
  const [expandedFlowId, setExpandedFlowId] = useState<number | null>(null);
  const { run, flows, executions, defects, attachments } = detail;
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

      {total > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border bg-surface-2 px-5 py-2">
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

          {(['OK', 'FAIL', 'WARNING', 'BLOCK', 'SKIP', 'PENDING'] as const).map((status) =>
            counts[status] > 0 ? (
              <Badge key={status} tone={STATUS_TONE[status]}>
                {STATUS_LABEL[status]} {counts[status]}
              </Badge>
            ) : null,
          )}
        </div>
      ) : null}

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-5">
        {flows.length === 0 ? (
          <EmptyState
            icon={<ChevronRight />}
            title="Sesión sin flujos"
            description="Agregá el primer flujo para empezar a explorar."
            action={
              !isFinished ? (
                <Button variant="primary" onClick={onAddFlow}>
                  <Plus />
                  Agregar flujo
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full border-collapse text-footnote">
              <thead>
                <tr className="border-b border-border bg-fill-soft text-caption uppercase tracking-wide text-fg-subtle">
                  <th className="w-24 px-4 py-2 text-left font-semibold">Key</th>
                  <th className="px-4 py-2 text-left font-semibold">Flujo</th>
                  <th className="w-24 px-4 py-2 text-left font-semibold">Status</th>
                  <th className="w-32 px-4 py-2 text-left font-semibold">Tester</th>
                  <th className="w-36 px-4 py-2 text-left font-semibold">Última ejecución</th>
                </tr>
              </thead>
              <tbody>
                {flows.map((flow) => {
                  const exec = execByTc.get(flow.id);
                  const status = exec?.status ?? 'PENDING';
                  const isExpanded = expandedFlowId === flow.id;

                  return [
                    <tr
                      key={flow.id}
                      onClick={() => setExpandedFlowId(isExpanded ? null : flow.id)}
                      className={cn(
                        'cursor-pointer border-b border-border border-l-[3px] border-l-transparent transition-colors hover:bg-fill-soft',
                        isExpanded && 'border-l-brand bg-brand-soft hover:bg-brand-soft',
                      )}
                    >
                      <td className="px-4 py-2.5 font-mono text-caption font-bold text-brand">
                        <span className="flex items-center gap-1.5">
                          <ChevronRight
                            className={cn('size-3 transition-transform', isExpanded && 'rotate-90')}
                          />
                          {flow.key_id ?? `#${flow.id}`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-fg">{flow.title}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={STATUS_TONE[status] ?? 'neutral'}>
                          {STATUS_LABEL[status] ?? status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-caption text-fg-muted">
                        {exec?.tester ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-caption text-fg-subtle">
                        {exec?.executed_at
                          ? new Date(exec.executed_at).toLocaleString('es-AR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </tr>,

                    isExpanded ? (
                      <tr key={`detail-${flow.id}`} className="border-b border-border bg-surface-2">
                        <td colSpan={5} className="p-0">
                          <FlowDetail
                            flow={flow}
                            execution={exec}
                            defects={defectsFor(flow)}
                            attachments={attachments as ExploratoryAttachment[]}
                            runId={run.id}
                            isFinished={isFinished}
                            projectId={projectId}
                          />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
