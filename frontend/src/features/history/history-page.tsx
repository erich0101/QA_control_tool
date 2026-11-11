import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { EmptyState } from '@/components/ui/empty-state';
import type { Defect, TestRun } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-keys';
import { useUiStore } from '@/stores/ui';
import { BugsView } from './components/bugs-view';
import { RunBugsDialog } from './components/run-bugs-dialog';
import { RunsView } from './components/runs-view';
import { useHistoryMutations, useHistoryRuns, useProjectDefects } from './use-history';

/**
 * Historial: ciclos finalizados y defectos del proyecto.
 * Pendiente respecto del legacy: reporte consolidado multi-ciclo, creación
 * masiva de tickets en Jira y el reporte personalizado del tester.
 */
export function HistoryPage() {
  const projectId = useUiStore((s) => s.activeProjectId);
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('runs');
  const [page, setPage] = useState(1);
  const [bugsRun, setBugsRun] = useState<TestRun | null>(null);

  const runsQuery = useHistoryRuns(projectId, page);
  const defectsQuery = useProjectDefects(projectId);
  const { retest, dismiss } = useHistoryMutations(projectId);

  const runs = runsQuery.data?.runs ?? [];
  const defects = defectsQuery.data ?? [];

  const handleRetest = async (run: TestRun) => {
    const ok = await confirm({
      title: 'Iniciar retesting',
      description:
        `Se va a crear un nuevo ciclo con los tests que fallaron o se bloquearon en “${run.suite_title}” (#${run.id}).\n\n` +
        'El ciclo queda activo en la pestaña Ejecución.',
      confirmLabel: 'Iniciar retest',
    });
    if (ok) retest.mutate(run.id);
  };

  const handleDismiss = async (bug: Defect) => {
    const isDismissed = bug.status === 'DISMISSED';
    if (!isDismissed) {
      const ok = await confirm({
        title: 'Descartar bug',
        description: `¿Descartar “${bug.title}”? Podés reabrirlo después.`,
        confirmLabel: 'Descartar',
        destructive: true,
      });
      if (!ok) return;
    }

    dismiss.mutate({ id: bug.id, dismissed: !isDismissed });
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['history', projectId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.defects(projectId) });
  };

  if (!projectId) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState
          icon={<History />}
          title="Seleccioná un proyecto"
          description="Usá el selector de la barra superior para ver su historial."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-surface px-5 py-2.5">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
            Historial
          </span>
          <Badge tone="neutral">{runsQuery.data?.total ?? 0} ciclos</Badge>
          <Badge tone="brand">{defects.length} bugs</Badge>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            loading={runsQuery.isFetching || defectsQuery.isFetching}
            onClick={refresh}
          >
            <RefreshCw />
            Recargar
          </Button>
        </div>

        <div className="inline-flex gap-1 rounded-full bg-fill p-1">
          {[
            { id: 'runs', label: 'Ejecuciones' },
            { id: 'bugs', label: 'Bugs & Defectos' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-pressed={tab === item.id}
              className={
                tab === item.id
                  ? 'rounded-full bg-brand px-4 py-1 text-caption font-semibold text-white'
                  : 'rounded-full px-4 py-1 text-caption font-medium text-fg-muted hover:text-fg'
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-5">
        {tab === 'runs' ? (
          <RunsView
            runs={runs}
            isLoading={runsQuery.isLoading}
            total={runsQuery.data?.total ?? 0}
            page={page}
            totalPages={runsQuery.data?.totalPages ?? 1}
            onPageChange={setPage}
            onViewBugs={setBugsRun}
            onRetest={handleRetest}
            isRetesting={retest.isPending}
          />
        ) : (
          <BugsView
            bugs={defects}
            isLoading={defectsQuery.isLoading}
            onDismiss={handleDismiss}
            isBusy={dismiss.isPending}
          />
        )}
      </div>

      {/* Radix Tabs controla solo el toolbar; el contenido se renderiza aparte. */}
      <RunBugsDialog run={bugsRun} onOpenChange={(open) => !open && setBugsRun(null)} />
    </div>
  );
}
