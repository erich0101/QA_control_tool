import { CircleAlert, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { JiraDailyIssue } from '@/lib/api/stats';
import { jiraIssueUrl } from '@/lib/api/jira';
import { formatDate, initials } from '@/lib/utils';
import { KpiCard, ProgressBar } from './charts';
import { useJiraDaily } from '../use-dashboard';

const PRIORITY_ORDER: Record<string, number> = {
  Highest: 0,
  Crítica: 0,
  High: 1,
  Alta: 1,
  Medium: 2,
  Media: 2,
};

const isDone = (issue: JiraDailyIssue) => issue.statusCategory === 'done';

function ageInDays(issue: JiraDailyIssue) {
  if (!issue.created) return 0;
  return Math.floor((Date.now() - new Date(issue.created).getTime()) / 86_400_000);
}

const STATUS_TONE = (issue: JiraDailyIssue): 'ok' | 'warn' | 'brand' | 'neutral' => {
  const value = (issue.status ?? '').toUpperCase();
  if (isDone(issue) || value.includes('DONE')) return 'ok';
  if (value.includes('PROGRESS') || value.includes('REVIEW')) return 'brand';
  if (value.includes('BLOCK')) return 'warn';
  return 'neutral';
};

export function DailyTab({ projectId }: { projectId: number }) {
  const { data, isLoading } = useJiraDaily(projectId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <EmptyState
        icon={<CircleAlert />}
        title="Configuración pendiente"
        description={data?.error ?? 'Configurá el token de Jira para ver el tablero diario.'}
      />
    );
  }

  const issues = data.issues ?? [];
  const open = issues.filter((issue) => !isDone(issue));
  const criticalAge = open.filter((issue) => ageInDays(issue) > 7).length;

  const urgent = [...open]
    .sort((a, b) => {
      const delta = (PRIORITY_ORDER[a.priority ?? ''] ?? 5) - (PRIORITY_ORDER[b.priority ?? ''] ?? 5);
      if (delta !== 0) return delta;
      return new Date(a.created ?? 0).getTime() - new Date(b.created ?? 0).getTime();
    })
    .slice(0, 8);

  const workload = Object.entries(data.assigneeCounts ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Lead time" value={`${data.avgResolutionDays ?? 0} días`} hint="Promedio de resolución" />
        <KpiCard label="Bugs abiertos" value={data.openCount ?? 0} tone="fail" />
        <KpiCard label="Cerrados hoy" value={data.closedToday ?? 0} tone="ok" />
        <KpiCard
          label="Antigüedad crítica"
          value={criticalAge}
          tone="warn"
          hint="Abiertos hace más de 7 días"
        />
      </div>

      {workload.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Carga por responsable
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {workload.map(([name, count]) => {
              const pct = Math.min(100, (count / 12) * 100);
              const tone = count > 8 ? 'fail' : count > 4 ? 'warn' : 'brand';
              const avatar = issues.find((issue) => issue.assignee === name)?.avatar;

              return (
                <div key={name} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex items-center gap-2">
                    {avatar ? (
                      <img src={avatar} alt="" className="size-8 rounded-lg" />
                    ) : (
                      <span className="flex size-8 items-center justify-center rounded-lg bg-fill text-caption font-bold text-fg-muted">
                        {initials(name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-footnote font-semibold text-fg">{name}</p>
                      <p className="text-caption text-fg-subtle">{count} tickets activos</p>
                    </div>
                  </div>
                  <ProgressBar value={pct} tone={tone} className="mt-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
            Foco de la daily
          </CardTitle>
          <Badge tone="fail">{urgent.length} urgentes</Badge>
        </CardHeader>
        <CardContent>
          {urgent.length === 0 ? (
            <p className="py-6 text-center text-footnote text-fg-subtle">
              No hay tickets abiertos. ¡Todo al día!
            </p>
          ) : (
            <DataTable
              dense
              containerClassName="rounded-lg"
              columns={[
                {
                  id: 'ticket',
                  header: 'Ticket',
                  headerClassName: 'w-28',
                  cell: (issue) => (
                    <a
                      href={
                        data.jiraUrl
                          ? `${data.jiraUrl.replace(/\/$/, '')}/browse/${issue.key}`
                          : jiraIssueUrl(issue.key)
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-caption font-bold text-brand hover:underline"
                    >
                      {issue.key}
                    </a>
                  ),
                },
                {
                  id: 'status',
                  header: 'Estado',
                  headerClassName: 'w-32',
                  cell: (issue) => <Badge tone={STATUS_TONE(issue)}>{issue.status ?? '—'}</Badge>,
                },
                {
                  id: 'summary',
                  header: 'Título',
                  cellClassName: 'max-w-md',
                  cell: (issue) => <p className="truncate text-fg">{issue.summary ?? '—'}</p>,
                },
                {
                  id: 'assignee',
                  header: 'Responsable',
                  headerClassName: 'w-44',
                  cell: (issue) => (
                    <span className="flex items-center gap-1.5">
                      {issue.avatar ? (
                        <img src={issue.avatar} alt="" className="size-5 rounded-full" />
                      ) : null}
                      <span className="truncate text-caption text-fg-muted">
                        {issue.assignee ?? 'Sin asignar'}
                      </span>
                    </span>
                  ),
                },
                {
                  id: 'age',
                  header: 'Antig.',
                  align: 'right',
                  headerClassName: 'w-20',
                  cell: (issue) => {
                    const age = ageInDays(issue);
                    return (
                      <span
                        className={
                          age > 7
                            ? 'text-caption font-bold text-fail'
                            : 'text-caption text-fg-subtle'
                        }
                      >
                        {age}d
                      </span>
                    );
                  },
                },
              ]}
              rows={urgent}
              getRowId={(issue) => issue.key}
            />
          )}
        </CardContent>
      </Card>

      {data.severityCounts && Object.keys(data.severityCounts).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Distribución por severidad / épica
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(data.severityCounts).map(([severity, count]) =>
              count > 0 ? (
                <Badge key={severity} tone={severity === 'Crítica' || severity === 'Alta' ? 'fail' : 'warn'}>
                  {severity}: {count}
                </Badge>
              ) : null,
            )}
            {Object.entries(data.epicCounts ?? {}).map(([epic, count]) => (
              <Badge key={epic} tone="neutral" className="gap-1">
                <Ticket className="size-3" />
                {epic}: {count}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-caption text-fg-subtle">
        Última sincronización: {formatDate(new Date())} · datos en vivo desde Jira
      </p>
    </div>
  );
}
