import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Compass, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExploratoryHallazgo, ExploratorySession, ExploratoryFlow } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { useSessionStore } from '@/stores/session';
import { useTeam } from '@/features/team/use-team';
import { AddFlowDialog, AddHallazgoDialog, StartSessionDialog } from './components/session-dialogs';
import { SessionDetail } from './components/session-detail';
import { useExploratoriaMutations, useExploratorySession, useExploratorySessions } from './use-exploratoria';

type SubTab = 'active' | 'history';

export function ExploratoriaPage() {
  const projectId = useUiStore((s) => s.activeProjectId);
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();

  const subTab: SubTab = params.get('v') === 'history' ? 'history' : 'active';
  const runId = Number(params.get('run')) || null;

  const [search, setSearch] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [flowForm, setFlowForm] = useState<{
    mode: 'create' | 'edit';
    flow?: ExploratoryFlow;
  } | null>(null);
  const [hallazgoForm, setHallazgoForm] = useState<{
    mode: 'create' | 'edit';
    hallazgo?: ExploratoryHallazgo;
  } | null>(null);

  const status = subTab === 'active' ? 'RUNNING' : 'FINISHED';
  // Mismo criterio que la pantalla de Hallazgos (POST /api/hallazgos).
  const canAddHallazgo = useSessionStore((s) => s.canManage() || s.can('can_create_cu'));
  // Borrar flujos/hallazgos exige rol Admin o Analista QA (requireAdmin).
  const canManage = useSessionStore((s) => s.canManage());
  const { data: sessions = [], isLoading } = useExploratorySessions(projectId, status);
  const { data: detail, isLoading: detailLoading } = useExploratorySession(runId);
  const { data: team = [] } = useTeam();
  const mutations = useExploratoriaMutations(projectId, runId);

  const patchParams = (updates: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  };

  const filtered = sessions.filter((session) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      (session.name ?? '').toLowerCase().includes(term) ||
      (session.charter ?? '').toLowerCase().includes(term) ||
      String(session.id).includes(term)
    );
  });

  const handleFinish = async (id: number) => {
    const ok = await confirm({
      title: 'Finalizar sesión',
      description:
        '¿Finalizar esta sesión exploratoria? Los flujos quedan guardados y la sesión pasa a Finalizadas.',
      confirmLabel: 'Finalizar',
    });
    if (!ok) return;

    await mutations.finishSession.mutateAsync(id);
    patchParams({ run: null });
  };

  const handleDeleteFlow = async (flow: ExploratoryFlow) => {
    const ok = await confirm({
      title: 'Eliminar flujo',
      description: `¿Eliminar “${flow.title}”? Se borra el test case y su ejecución de la sesión.`,
      confirmLabel: 'Eliminar flujo',
      destructive: true,
    });
    if (!ok) return;
    await mutations.removeFlow.mutateAsync(flow.id);
  };

  const handleDeleteHallazgo = async (hallazgo: ExploratoryHallazgo) => {
    const ok = await confirm({
      title: 'Eliminar hallazgo',
      description: `¿Eliminar “${hallazgo.title}”?${
        hallazgo.jira_key ? ' El ticket de Jira no se elimina.' : ''
      }`,
      confirmLabel: 'Eliminar hallazgo',
      destructive: true,
    });
    if (!ok) return;
    await mutations.removeHallazgo.mutateAsync(hallazgo.id);
  };

  if (!projectId) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState
          icon={<Compass />}
          title="Seleccioná un proyecto"
          description="Usá el selector de la barra superior para ver sus sesiones exploratorias."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Sidebar ── */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-surface">
        <div className="shrink-0 space-y-2 border-b border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">
              Exploratoria
            </span>
            <div className="flex gap-1">
              <Badge tone="neutral">{sessions.length} S</Badge>
              <Badge tone="brand">
                {sessions.reduce((acc, session) => acc + (session.flow_count ?? 0), 0)} F
              </Badge>
            </div>
          </div>

          <div className="flex gap-1 rounded-full bg-fill p-1">
            {(
              [
                { id: 'active', label: 'Activas' },
                { id: 'history', label: 'Finalizadas' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => patchParams({ v: tab.id === 'active' ? null : tab.id, run: null })}
                aria-pressed={subTab === tab.id}
                className={cn(
                  'flex-1 rounded-full px-3 py-1 text-caption font-semibold transition-colors',
                  subTab === tab.id ? 'bg-brand text-white' : 'text-fg-muted hover:text-fg',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar sesión…"
              className="h-8 pl-8 text-footnote"
              aria-label="Buscar sesión"
            />
          </div>

          <Button variant="primary" size="sm" className="w-full" onClick={() => setStartOpen(true)}>
            <Plus />
            Nueva sesión
          </Button>
        </div>

        <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2 rounded-md border border-border p-2.5">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-center text-footnote text-fg-subtle">
              {sessions.length === 0
                ? subTab === 'active'
                  ? 'No hay sesiones activas.'
                  : 'Todavía no finalizaste ninguna sesión.'
                : 'Sin resultados.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  isActive={session.id === runId}
                  onSelect={() => patchParams({ run: String(session.id) })}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Detalle ── */}
      <section className="min-w-0 flex-1">
        {runId ? (
          detailLoading || !detail ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <SessionDetail
              detail={detail}
              projectId={projectId}
              team={team}
              isFinishing={mutations.finishSession.isPending}
              isAssigning={mutations.assignTester.isPending}
              isHallazgoPending={
                mutations.setHallazgoStatus.isPending ||
                mutations.assignHallazgo.isPending ||
                mutations.updateHallazgo.isPending ||
                mutations.removeHallazgo.isPending
              }
              isFlowPending={mutations.updateFlow.isPending || mutations.removeFlow.isPending}
              canDelete={canManage}
              onBack={() => patchParams({ run: null })}
              onAddFlow={() => setFlowForm({ mode: 'create' })}
              onAddHallazgo={() => setHallazgoForm({ mode: 'create' })}
              canAddHallazgo={canAddHallazgo}
              onFinish={() => handleFinish(detail.run.id)}
              onAssignTester={(tcId, userId) =>
                mutations.assignTester.mutate({ tcId, userId })
              }
              onHallazgoStatus={(id, status) =>
                mutations.setHallazgoStatus.mutate({ id, status })
              }
              onHallazgoAssign={(id, userId) =>
                mutations.assignHallazgo.mutate({ id, userId })
              }
              onEditFlow={(flow) => setFlowForm({ mode: 'edit', flow })}
              onDeleteFlow={handleDeleteFlow}
              onEditHallazgo={(hallazgo) => setHallazgoForm({ mode: 'edit', hallazgo })}
              onDeleteHallazgo={handleDeleteHallazgo}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<Compass />}
              title="Seleccioná una sesión"
              description={
                subTab === 'active'
                  ? 'Iniciá una sesión exploratoria para empezar a registrar flujos.'
                  : 'Elegí una sesión finalizada para revisar sus flujos.'
              }
              action={
                subTab === 'active' ? (
                  <Button variant="primary" onClick={() => setStartOpen(true)}>
                    <Plus />
                    Nueva sesión
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </section>

      <StartSessionDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        isPending={mutations.startSession.isPending}
        onSubmit={async (values) => {
          const result = await mutations.startSession.mutateAsync({
            project_id: projectId,
            name: values.name,
            charter: values.charter,
            timebox_minutes: values.timebox_minutes,
          });
          patchParams({ v: null, run: String(result.run_id) });
        }}
      />

      {runId && flowForm ? (
        <AddFlowDialog
          open
          onOpenChange={(open) => {
            if (!open) setFlowForm(null);
          }}
          isPending={
            flowForm.mode === 'create'
              ? mutations.addFlow.isPending
              : mutations.updateFlow.isPending
          }
          initial={flowForm.flow}
          onSubmit={async (values) => {
            if (flowForm.mode === 'edit' && flowForm.flow) {
              await mutations.updateFlow.mutateAsync({ id: flowForm.flow.id, input: values });
              return;
            }
            await mutations.addFlow.mutateAsync({ id: runId, input: values });
          }}
        />
      ) : null}

      {runId && hallazgoForm ? (
        <AddHallazgoDialog
          open
          onOpenChange={(open) => {
            if (!open) setHallazgoForm(null);
          }}
          isPending={
            hallazgoForm.mode === 'create'
              ? mutations.addHallazgo.isPending
              : mutations.updateHallazgo.isPending
          }
          initial={hallazgoForm.hallazgo}
          onSubmit={async (values) => {
            if (hallazgoForm.mode === 'edit' && hallazgoForm.hallazgo) {
              await mutations.updateHallazgo.mutateAsync({
                id: hallazgoForm.hallazgo.id,
                patch: values,
              });
              return;
            }
            await mutations.addHallazgo.mutateAsync(values);
          }}
        />
      ) : null}
    </div>
  );
}

function SessionRow({
  session,
  isActive,
  onSelect,
}: {
  session: ExploratorySession;
  isActive: boolean;
  onSelect: () => void;
}) {
  const finished = session.status === 'FINISHED';

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? 'true' : undefined}
        className={cn(
          'w-full rounded-md border border-transparent border-l-[3px] px-2.5 py-2 text-left transition-colors',
          isActive ? 'border-l-brand bg-brand-soft' : 'border-l-transparent hover:bg-fill-soft',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-caption text-fg-subtle">#{session.id}</span>
          <Badge tone={finished ? 'neutral' : 'ok'}>{finished ? 'FINALIZADA' : 'EN CURSO'}</Badge>
        </div>

        <p className="mt-1 line-clamp-2 text-footnote font-medium leading-snug text-fg">
          {session.name ?? `Sesión #${session.id}`}
        </p>

        {session.charter ? (
          <p className="mt-0.5 line-clamp-1 text-caption text-fg-subtle">{session.charter}</p>
        ) : null}

        <p className="mt-1 flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
          <span className="text-brand">{session.flow_count ?? 0} flujos</span>
          {(session.hallazgo_count ?? 0) > 0 ? (
            <span className="text-warn">
              {session.hallazgo_count} hallazgo{session.hallazgo_count === 1 ? '' : 's'}
            </span>
          ) : null}
          {(session.fail_count ?? 0) > 0 ? (
            <span className="text-fail">{session.fail_count} FAIL</span>
          ) : null}
          {session.started_at ? (
            <span>{new Date(session.started_at).toLocaleDateString('es-AR')}</span>
          ) : null}
        </p>
      </button>
    </li>
  );
}
