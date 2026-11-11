import { ChevronRight, Pause, Play, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ExecutionStatus, TestSuite, User, UserStory } from '@/lib/api/types';
import { cn, initials } from '@/lib/utils';
import { ExecutionDetail } from './execution-detail';
import { RunTimer } from './run-timer';

interface SuiteExecutionBlockProps {
  suite: TestSuite;
  isExpanded: boolean;
  onToggleSuite: () => void;
  expandedTcId: number | null;
  onToggleTc: (id: number) => void;
  statusFilter: string;
  stories: UserStory[];
  team: User[];
  projectId: number | null;
  isPausing: boolean;
  isResuming: boolean;
  isFinishing: boolean;
  onPause: (runId: number) => void;
  onResume: (runId: number) => void;
  onFinish: (suiteId: number) => void;
}

const STATUS_COLORS: Record<string, string> = {
  PASS: 'bg-ok',
  FAIL: 'bg-fail',
  BLOCK: 'bg-warn',
  SKIP: 'bg-fg-subtle',
  PENDING: 'bg-border-strong',
};

const STATUS_TEXT: Record<string, string> = {
  PASS: 'text-ok',
  FAIL: 'text-fail',
  BLOCK: 'text-warn',
  SKIP: 'text-fg-muted',
  PENDING: 'text-fg-subtle',
};

export function SuiteExecutionBlock({
  suite,
  isExpanded,
  onToggleSuite,
  expandedTcId,
  onToggleTc,
  statusFilter,
  stories,
  team,
  projectId,
  isPausing,
  isResuming,
  isFinishing,
  onPause,
  onResume,
  onFinish,
}: SuiteExecutionBlockProps) {
  const run = suite.activeRun;
  const allTests = suite.test_cases ?? [];
  const executed = allTests.filter((tc) => tc.status && tc.status !== 'PENDING').length;
  const progress = allTests.length > 0 ? Math.round((executed / allTests.length) * 100) : 0;

  const visibleTests =
    statusFilter === 'all' ? allTests : allTests.filter((tc) => tc.status === statusFilter);

  const teamById = new Map(team.map((user) => [user.id, user]));
  const storyById = new Map(stories.map((story) => [story.id, story]));

  if (!run) return null;

  const isRunning = run.status === 'RUNNING';

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={onToggleSuite}
          aria-expanded={isExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn('size-4 shrink-0 text-fg-subtle transition-transform', isExpanded && 'rotate-90')}
          />
          <span className="font-mono text-caption font-bold text-brand">SUITE #{suite.id}</span>
          <span className="truncate text-footnote font-semibold text-fg">{suite.title}</span>
        </button>

        <Badge tone={isRunning ? 'ok' : 'warn'}>{isRunning ? 'EJECUTANDO' : 'PAUSADO'}</Badge>

        <RunTimer run={run} className="text-caption text-fg-muted" />

        <div className="flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-fill">
            <div
              className={cn('h-full rounded-full transition-all', progress === 100 ? 'bg-ok' : 'bg-brand')}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-caption tabular-nums text-fg-subtle">
            {progress}% ({executed}/{allTests.length})
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isRunning ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPause(run.id)}
              loading={isPausing}
            >
              <Pause />
              Pausar
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResume(run.id)}
              loading={isResuming}
            >
              <Play />
              Reanudar
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="text-fail"
            onClick={() => onFinish(suite.id)}
            loading={isFinishing}
          >
            <Square />
            Finalizar
          </Button>
        </div>
      </div>

      {isExpanded ? (
        <div className="border-t border-border">
          {visibleTests.length === 0 ? (
            <p className="px-6 py-4 text-footnote text-fg-subtle">
              {allTests.length === 0 ? 'Sin casos de prueba.' : 'Ningún test coincide con el filtro.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {visibleTests.map((testCase) => {
                const status = (testCase.status as ExecutionStatus) || 'PENDING';
                const isTcExpanded = testCase.id === expandedTcId;
                const assignee = testCase.assigned_to
                  ? teamById.get(Number(testCase.assigned_to))
                  : null;

                const story = testCase.us_id ? storyById.get(Number(testCase.us_id)) : null;
                const scenarioIndex =
                  testCase.scenario_id && story?.scenarios
                    ? story.scenarios.findIndex((s) => s.id === testCase.scenario_id)
                    : -1;

                return (
                  <li key={testCase.id}>
                    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-fill-soft">
                      <button
                        type="button"
                        onClick={() => onToggleTc(testCase.id)}
                        aria-expanded={isTcExpanded}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <ChevronRight
                          className={cn(
                            'size-3.5 shrink-0 text-fg-subtle transition-transform',
                            isTcExpanded && 'rotate-90',
                          )}
                        />
                        <span
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            STATUS_COLORS[status] ?? STATUS_COLORS.PENDING,
                          )}
                        />
                        <span className="shrink-0 font-mono text-caption font-semibold text-brand">
                          {testCase.key_id}
                        </span>
                        {scenarioIndex >= 0 ? (
                          <Badge tone="neutral" className="shrink-0">
                            E{scenarioIndex + 1}
                          </Badge>
                        ) : null}
                        <span className="truncate text-footnote text-fg">{testCase.title}</span>
                      </button>

                      <span
                        className={cn(
                          'w-20 shrink-0 text-right text-caption font-bold',
                          STATUS_TEXT[status] ?? STATUS_TEXT.PENDING,
                        )}
                      >
                        {status}
                      </span>

                      {assignee ? (
                        <span className="flex w-24 shrink-0 items-center gap-1.5" title={assignee.name}>
                          <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">
                            {initials(assignee.name)}
                          </span>
                          <span className="truncate text-caption text-fg-subtle">
                            {assignee.name.split(' ')[0]}
                          </span>
                        </span>
                      ) : (
                        <span className="w-24 shrink-0" />
                      )}
                    </div>

                    {isTcExpanded ? (
                      <div className="border-t border-border bg-surface-2">
                        <ExecutionDetail testCase={testCase} projectId={projectId} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
