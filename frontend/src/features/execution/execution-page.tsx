import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { CirclePlay, RefreshCw, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { EmptyState } from '@/components/ui/empty-state';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { userStoriesApi } from '@/lib/api/use-cases';
import type { UserStory } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-keys';
import { useUiStore } from '@/stores/ui';
import { useTeam, useTestSuites } from '@/features/test-suites/use-test-suites';
import { useUseCases } from '@/features/use-cases/use-use-cases';
import { SuiteExecutionBlock } from './components/suite-execution-block';
import { useExecutionMutations } from './use-execution';

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'PASS', label: 'Pasados' },
  { value: 'FAIL', label: 'Fallidos' },
  { value: 'BLOCK', label: 'Bloqueados' },
  { value: 'SKIP', label: 'Saltados' },
];

export function ExecutionPage() {
  const projectId = useUiStore((s) => s.activeProjectId);
  const confirm = useConfirm();

  const { data: suites = [], isLoading, refetch, isFetching } = useTestSuites(projectId);
  const { data: useCases = [] } = useUseCases(projectId);
  const { data: team = [] } = useTeam();
  const mutations = useExecutionMutations(projectId);

  const [useCaseId, setUseCaseId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedSuiteId, setExpandedSuiteId] = useState<number | null>(null);
  const [expandedTcId, setExpandedTcId] = useState<number | null>(null);

  const activeSuites = useMemo(() => suites.filter((suite) => suite.activeRun), [suites]);

  const visibleSuites = useMemo(
    () => (useCaseId ? activeSuites.filter((suite) => suite.use_case_id === useCaseId) : activeSuites),
    [activeSuites, useCaseId],
  );

  const totalTests = visibleSuites.reduce(
    (acc, suite) => acc + (suite.test_cases?.length ?? 0),
    0,
  );

  // Escenarios de las HUs: se usan para el badge "E1/E2" de cada test.
  const storyQueries = useQueries({
    queries: visibleSuites
      .map((suite) => suite.use_case_id)
      .filter((id): id is number => Boolean(id))
      .filter((id, index, array) => array.indexOf(id) === index)
      .map((cuId) => ({
        queryKey: queryKeys.userStories(cuId),
        queryFn: () => userStoriesApi.list(cuId),
        select: (data: { userStories: UserStory[] }) => data.userStories ?? [],
        staleTime: 30_000,
      })),
  });

  const stories = storyQueries.flatMap((query) => query.data ?? []);

  // Mantiene una suite expandida válida.
  useEffect(() => {
    if (visibleSuites.length === 0) {
      if (expandedSuiteId !== null) setExpandedSuiteId(null);
      return;
    }
    if (!visibleSuites.some((suite) => suite.id === expandedSuiteId)) {
      setExpandedSuiteId(visibleSuites[0].id);
    }
  }, [visibleSuites, expandedSuiteId]);

  const handleFinish = async (suiteId: number) => {
    const suite = suites.find((item) => item.id === suiteId);
    const ok = await confirm({
      title: 'Finalizar ciclo de ejecución',
      description:
        `¿Finalizar el ciclo de “${suite?.title ?? `suite #${suiteId}`}”?\n\n` +
        'Los resultados se envían al histórico y la suite deja de aparecer en Ejecución.',
      confirmLabel: 'Finalizar',
    });
    if (ok) mutations.finish.mutate(suiteId);
  };

  const handleStartUseCase = async () => {
    if (!useCaseId) return;
    const useCase = useCases.find((item) => item.id === useCaseId);
    const ok = await confirm({
      title: 'Ejecutar caso de uso',
      description:
        `¿Iniciar la ejecución de todas las suites de “${useCase?.title ?? 'este caso de uso'}”?\n\n` +
        'Se ejecutarán solo los tests de regresión asignados a vos.',
      confirmLabel: 'Iniciar ejecución',
    });
    if (ok) mutations.startAll.mutate(useCaseId);
  };

  if (!projectId) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState
          icon={<Zap />}
          title="Seleccioná un proyecto"
          description="Usá el selector de la barra superior para ver las ejecuciones en curso."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Toolbar ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-5 py-2.5">
        <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
          Ejecución
        </span>
        <Badge tone="neutral">{visibleSuites.length} ciclos</Badge>
        <Badge tone="brand">{totalTests} tests</Badge>

        <div className="mx-1 h-5 w-px bg-border" aria-hidden />

        <div className="w-56">
          <SelectField
            value={useCaseId ? String(useCaseId) : ''}
            onValueChange={(value) => {
              setUseCaseId(value ? Number(value) : null);
              setExpandedTcId(null);
            }}
            allowEmpty
            placeholder="Todos los casos de uso"
            aria-label="Filtrar por caso de uso"
            options={useCases.map((item) => ({
              value: String(item.id),
              label: `${item.key_id} · ${item.title}`,
            }))}
          />
        </div>

        <Button
          variant="primary"
          size="sm"
          disabled={!useCaseId}
          loading={mutations.startAll.isPending}
          onClick={handleStartUseCase}
        >
          <CirclePlay />
          Ejecutar CU
        </Button>

        <div className="flex-1" />

        <div className="w-36">
          <SelectField
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={STATUS_FILTERS}
            aria-label="Filtrar por estado"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          loading={isFetching}
          onClick={async () => {
            await refetch();
          }}
        >
          <RefreshCw />
          Sincronizar
        </Button>
      </div>

      {/* ── Árbol de ciclos ── */}
      <div className="scrollbar-apple min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : visibleSuites.length === 0 ? (
          <EmptyState
            icon={<Zap />}
            title="No hay ciclos de ejecución activos"
            description={
              activeSuites.length === 0
                ? 'Iniciá una ejecución desde Test Suites o con “Ejecutar CU” para empezar a registrar resultados.'
                : 'Ningún ciclo coincide con el filtro de caso de uso.'
            }
          />
        ) : (
          visibleSuites.map((suite) => (
            <SuiteExecutionBlock
              key={suite.id}
              suite={suite}
              isExpanded={expandedSuiteId === suite.id}
              onToggleSuite={() =>
                setExpandedSuiteId((current) => (current === suite.id ? null : suite.id))
              }
              expandedTcId={expandedTcId}
              onToggleTc={(id) =>
                setExpandedTcId((current) => (current === id ? null : id))
              }
              statusFilter={statusFilter}
              stories={stories}
              team={team}
              projectId={projectId}
              isPausing={mutations.pause.isPending}
              isResuming={mutations.resume.isPending}
              isFinishing={mutations.finish.isPending}
              onPause={(runId) => mutations.pause.mutate(runId)}
              onResume={(runId) => mutations.resume.mutate(runId)}
              onFinish={handleFinish}
            />
          ))
        )}
      </div>
    </div>
  );
}
