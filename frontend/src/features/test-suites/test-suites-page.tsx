import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { EmptyState } from '@/components/ui/empty-state';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { Inconsistency, TestCase } from '@/lib/api/types';
import { LEGACY_APP_URL } from '@/lib/env';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';
import { useUseCases, useUserStories } from '@/features/use-cases/use-use-cases';
import { InconsistenciesPanel } from './components/inconsistencies-panel';
import { InconsistencyDialog } from './components/inconsistency-dialog';
import { SuiteDialog } from './components/suite-dialog';
import { SuiteHeader } from './components/suite-header';
import { SuiteList } from './components/suite-list';
import { TestCaseDialog } from './components/test-case-dialog';
import { TestCaseTable } from './components/test-case-table';
import { useSuiteParams } from './lib/params';
import {
  useJiraEpics,
  useSuiteInconsistencies,
  useSuiteMutations,
  useTeam,
  useTestCaseMutations,
  useTestSuites,
} from './use-test-suites';

type DialogMode = 'suite-create' | 'suite-edit' | 'tc-create' | 'inconsistency' | null;

export function TestSuitesPage() {
  const projectId = useUiStore((s) => s.activeProjectId);
  const canManage = useSessionStore((s) => s.canManage());
  const canCreateTest = useSessionStore((s) => s.canManage() || s.can('can_create_test'));
  const canCreateSuite = useSessionStore((s) => s.canManage() || s.can('can_create_suite'));
  const confirm = useConfirm();

  const { useCaseId, suiteId, testCaseId, selectUseCase, selectSuite, selectTestCase } =
    useSuiteParams();
  const [dialog, setDialog] = useState<DialogMode>(null);

  const { data: suites = [], isLoading } = useTestSuites(projectId);
  const { data: useCases = [] } = useUseCases(projectId);
  const { data: team = [] } = useTeam();
  const { data: epics = [] } = useJiraEpics(projectId);

  const visibleSuites = useMemo(
    () => (useCaseId ? suites.filter((item) => item.use_case_id === useCaseId) : suites),
    [suites, useCaseId],
  );

  const suite = suites.find((item) => item.id === suiteId) ?? null;
  const { data: stories = [] } = useUserStories(suite?.use_case_id ?? null);

  const suiteMutations = useSuiteMutations(projectId);
  const testCaseMutations = useTestCaseMutations(projectId);
  const inconsistencyMutations = useSuiteInconsistencies(projectId);

  // Mantiene una suite seleccionada válida.
  useEffect(() => {
    if (isLoading) return;
    const exists = visibleSuites.some((item) => item.id === suiteId);
    if (!exists) selectSuite(visibleSuites[0]?.id ?? null);
  }, [isLoading, visibleSuites, suiteId, selectSuite]);

  const teamNames = useMemo(
    () => new Map(team.map((user) => [user.id, user.name])),
    [team],
  );

  const handleDeleteSuite = async () => {
    if (!suite) return;
    const ok = await confirm({
      title: 'Eliminar test suite',
      description:
        `¿Eliminar “${suite.title}” (#${suite.id})?\n\n` +
        `Se eliminarán sus ${suite.test_cases?.length ?? 0} tests, ejecuciones e inconsistencias.\n\n` +
        'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar suite',
      destructive: true,
    });
    if (!ok) return;

    await suiteMutations.remove.mutateAsync(suite.id);
    selectSuite(null);
  };

  const handleDeleteTestCase = async (testCase: TestCase) => {
    const ok = await confirm({
      title: 'Eliminar test case',
      description: `¿Eliminar ${testCase.key_id} — “${testCase.title}”?`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;

    await testCaseMutations.remove.mutateAsync(testCase.id);
    if (testCaseId === testCase.id) selectTestCase(null);
  };

  const handleResolveInconsistency = async (inconsistency: Inconsistency) => {
    const ok = await confirm({
      title: 'Resolver inconsistencia',
      description: `“${inconsistency.title}”\n\nSe eliminará definitivamente.`,
      confirmLabel: 'Resolver',
    });
    if (ok) inconsistencyMutations.remove.mutate(inconsistency.id);
  };

  const handleRunSuite = async () => {
    if (!suite) return;
    if (suite.active_run_id) {
      toast.info(`La suite ya tiene un ciclo activo (run #${suite.active_run_id})`);
      return;
    }
    const ok = await confirm({
      title: 'Iniciar ejecución',
      description: `Se va a crear un ciclo de ejecución para “${suite.title}” con todos sus tests.`,
      confirmLabel: 'Iniciar',
    });
    if (ok) suiteMutations.startRun.mutate(suite.id);
  };

  if (!projectId) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState
          icon={<FlaskConical />}
          title="Seleccioná un proyecto"
          description="Usá el selector de la barra superior para ver sus test suites."
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
              Test suites
            </span>
            <div className="flex gap-1">
              <Badge tone="neutral">{visibleSuites.length} S</Badge>
              <Badge tone="brand">
                {visibleSuites.reduce(
                  (acc, item) => acc + (item.test_cases_count ?? item.test_cases?.length ?? 0),
                  0,
                )}{' '}
                T
              </Badge>
            </div>
          </div>

          <SelectField
            value={useCaseId ? String(useCaseId) : ''}
            onValueChange={(value) => selectUseCase(value ? Number(value) : null)}
            allowEmpty
            placeholder="Todos los casos de uso"
            aria-label="Filtrar por caso de uso"
            options={useCases.map((item) => ({
              value: String(item.id),
              label: `${item.key_id} · ${item.title}`,
            }))}
          />

          <Button
            variant="primary"
            size="sm"
            className="w-full"
            disabled={!canCreateSuite}
            onClick={() => setDialog('suite-create')}
          >
            <Plus />
            Nueva suite
          </Button>
        </div>

        <SuiteList
          suites={visibleSuites}
          isLoading={isLoading}
          selectedId={suiteId}
          teamNames={teamNames}
          onSelect={selectSuite}
        />
      </aside>

      {/* ── Detalle ── */}
      <section className="flex min-w-0 flex-1 flex-col">
        {suite ? (
          <>
            <SuiteHeader
              suite={suite}
              team={team}
              canManage={canManage}
              canCreateTest={canCreateTest}
              isRunning={suiteMutations.startRun.isPending}
              isAssigning={suiteMutations.assignAll.isPending}
              onEdit={() => setDialog('suite-edit')}
              onDelete={handleDeleteSuite}
              onRun={handleRunSuite}
              onNewTestCase={() => setDialog('tc-create')}
              onAssignAll={(userId) =>
                suiteMutations.assignAll.mutate({
                  id: suite.id,
                  userId: userId && userId > 0 ? userId : null,
                })
              }
              onToggleActive={(isActive) =>
                suiteMutations.setActive.mutate({ id: suite.id, isActive })
              }
              onAiTool={() =>
                toast.info('El asistente AI Tool todavía vive en la UI anterior', {
                  action: { label: 'Abrir', onClick: () => window.open(LEGACY_APP_URL, '_blank') },
                })
              }
            />

            <InconsistenciesPanel
              inconsistencies={suite.inconsistencies ?? []}
              onResolve={handleResolveInconsistency}
              onAdd={() => setDialog('inconsistency')}
              isBusy={inconsistencyMutations.remove.isPending}
            />

            <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-5">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : (
                <TestCaseTable
                  suite={suite}
                  testCases={suite.test_cases ?? []}
                  suites={suites}
                  stories={stories}
                  team={team}
                  epics={epics}
                  projectId={projectId}
                  selectedId={testCaseId}
                  canManage={canManage}
                  onSelect={selectTestCase}
                  onRun={(id) => suiteMutations.startTestCase.mutate(id)}
                  onDelete={handleDeleteTestCase}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState
              icon={<FlaskConical />}
              title={visibleSuites.length === 0 ? 'Sin test suites' : 'Seleccioná una suite'}
              description={
                visibleSuites.length === 0
                  ? 'Creá la primera suite del proyecto para empezar a cargar test cases.'
                  : 'Hacé clic en una suite de la izquierda para gestionar sus tests.'
              }
              action={
                canCreateSuite && visibleSuites.length === 0 ? (
                  <Button variant="primary" onClick={() => setDialog('suite-create')}>
                    <Plus />
                    Nueva suite
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </section>

      <SuiteDialog
        open={dialog === 'suite-create' || dialog === 'suite-edit'}
        onOpenChange={(open) => setDialog(open ? dialog ?? 'suite-create' : null)}
        projectId={projectId}
        useCases={useCases}
        defaultUseCaseId={useCaseId}
        suite={dialog === 'suite-edit' ? suite : null}
        epics={epics}
        onCreated={(id) => selectSuite(id)}
      />

      {suite ? (
        <>
          <TestCaseDialog
            open={dialog === 'tc-create'}
            onOpenChange={(open) => setDialog(open ? 'tc-create' : null)}
            projectId={projectId}
            suite={suite}
            epics={epics}
            onCreated={(id) => selectTestCase(id)}
          />

          <InconsistencyDialog
            open={dialog === 'inconsistency'}
            onOpenChange={(open) => setDialog(open ? 'inconsistency' : null)}
            suiteTitle={suite.title}
            isPending={inconsistencyMutations.create.isPending}
            onSubmit={async (values) => {
              await inconsistencyMutations.create.mutateAsync({
                suite_id: suite.id,
                title: values.title,
                description: values.description,
                severity: values.severity,
              });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
