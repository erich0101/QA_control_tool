import { CirclePlay, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
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
    <DataTable
      columns={[
        {
          id: 'key',
          header: 'Key',
          headerClassName: 'w-24',
          cellClassName: 'font-mono text-caption font-bold text-brand',
          cell: (testCase) => testCase.key_id,
        },
        {
          id: 'title',
          header: 'Título',
          cell: (testCase) => (
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
          ),
        },
        {
          id: 'assignee',
          header: 'Asignado',
          headerClassName: 'w-32',
          cell: (testCase) => {
            const assignee = testCase.assigned_to
              ? teamById.get(Number(testCase.assigned_to))
              : null;

            return assignee ? (
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
            );
          },
        },
        {
          id: 'lastExecution',
          header: 'Últ. ejecución',
          headerClassName: 'w-28',
          cellClassName: 'text-caption text-fg-subtle',
          cell: (testCase) =>
            testCase.last_execution_at
              ? new Date(testCase.last_execution_at).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                })
              : '—',
        },
        {
          id: 'status',
          header: 'Estado',
          align: 'center',
          headerClassName: 'w-28',
          cell: (testCase) => (
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
          ),
        },
        {
          id: 'actions',
          header: 'Acciones',
          align: 'center',
          headerClassName: 'w-28',
          cell: (testCase) => (
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
          ),
        },
      ]}
      rows={testCases}
      getRowId={(testCase) => testCase.id}
      onRowClick={(testCase) => onSelect(testCase.id === selectedId ? null : testCase.id)}
      activeRowId={selectedId}
      expandedRowId={selectedId}
      renderExpanded={(testCase) => (
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
      )}
    />
  );
}
