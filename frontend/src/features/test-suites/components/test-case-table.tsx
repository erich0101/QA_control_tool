import { CirclePlay, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TestCase, TestSuite, User, UserStory } from '@/lib/api/types';
import { cn, initials } from '@/lib/utils';
import { TestCaseDetail } from './test-case-detail';

interface TestCaseTableProps {
  suite: TestSuite;
  testCases: TestCase[];
  suites: TestSuite[];
  stories: UserStory[];
  team: User[];
  epics: Array<{ key: string; name: string }>;
  projectId: number | null;
  selectedId: number | null;
  canManage: boolean;
  onSelect: (id: number | null) => void;
  onRun: (id: number) => void;
  onDelete: (testCase: TestCase) => void;
}

export function TestCaseTable({
  suite,
  testCases,
  suites,
  stories,
  team,
  epics,
  projectId,
  selectedId,
  canManage,
  onSelect,
  onRun,
  onDelete,
}: TestCaseTableProps) {
  const teamById = new Map(team.map((user) => [user.id, user]));

  if (testCases.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-sm font-semibold text-fg">Sin casos de prueba</p>
        <p className="mt-1 text-footnote text-fg-muted">
          Esta suite todavía no tiene tests. Creá el primero con “Nuevo TC”.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-footnote">
        <thead>
          <tr className="border-b border-border bg-fill-soft text-caption uppercase tracking-wide text-fg-subtle">
            <th className="w-24 px-4 py-2 text-left font-semibold">Key</th>
            <th className="px-4 py-2 text-left font-semibold">Título</th>
            <th className="w-32 px-4 py-2 text-left font-semibold">Asignado</th>
            <th className="w-28 px-4 py-2 text-left font-semibold">Últ. ejecución</th>
            <th className="w-28 px-4 py-2 text-center font-semibold">Estado</th>
            <th className="w-28 px-4 py-2 text-center font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {testCases.map((testCase) => {
            const isSelected = testCase.id === selectedId;
            const assignee = testCase.assigned_to ? teamById.get(Number(testCase.assigned_to)) : null;
            const lastExecution = testCase.last_execution_at
              ? new Date(testCase.last_execution_at).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                })
              : '—';

            return [
              <tr
                key={testCase.id}
                onClick={() => onSelect(isSelected ? null : testCase.id)}
                className={cn(
                  'cursor-pointer border-b border-border border-l-[3px] border-l-transparent transition-colors hover:bg-fill-soft',
                  isSelected && 'border-l-brand bg-brand-soft hover:bg-brand-soft',
                )}
              >
                <td className="px-4 py-2.5 font-mono text-caption font-bold text-brand">
                  {testCase.key_id}
                </td>

                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        testCase.status === 'FAIL'
                          ? 'bg-fail'
                          : testCase.status === 'OK'
                            ? 'bg-ok'
                            : 'bg-fg-subtle',
                      )}
                    />
                    <span className="truncate font-medium text-fg">{testCase.title}</span>
                  </div>
                </td>

                <td className="px-4 py-2.5">
                  {assignee ? (
                    <span className="flex items-center gap-1.5">
                      <span className="flex size-6 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                        {initials(assignee.name)}
                      </span>
                      <span className="truncate text-caption text-fg-muted">
                        {assignee.name.split(' ')[0]}
                      </span>
                    </span>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </td>

                <td className="px-4 py-2.5 text-caption text-fg-subtle">{lastExecution}</td>

                <td className="px-4 py-2.5 text-center">
                  <Badge
                    tone={
                      testCase.status === 'OK'
                        ? 'ok'
                        : testCase.status === 'FAIL'
                          ? 'fail'
                          : testCase.status === 'BLOCK'
                            ? 'warn'
                            : 'neutral'
                    }
                  >
                    {testCase.status ?? 'PENDING'}
                  </Badge>
                </td>

                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-ok"
                      aria-label="Ejecutar test"
                      title="Ejecutar"
                      disabled={Boolean(suite.active_run_id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRun(testCase.id);
                      }}
                    >
                      <CirclePlay />
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-fail"
                      aria-label="Eliminar test"
                      title="Eliminar"
                      disabled={!canManage || Boolean(suite.active_run_id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(testCase);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>,

              isSelected ? (
                <tr key={`detail-${testCase.id}`} className="border-b border-border bg-surface-2">
                  <td colSpan={6} className="p-0">
                    <TestCaseDetail
                      key={testCase.id}
                      testCase={testCase}
                      suite={suite}
                      suites={suites}
                      stories={stories}
                      team={team}
                      epics={epics}
                      projectId={projectId}
                      canManage={canManage}
                      onClose={() => onSelect(null)}
                      onRun={() => onRun(testCase.id)}
                      onDelete={() => onDelete(testCase)}
                    />
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
