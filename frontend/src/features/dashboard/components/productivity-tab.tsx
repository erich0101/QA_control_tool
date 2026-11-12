import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { JiraSetupState } from '@/features/jira/components/jira-setup-state';
import { cn, initials } from '@/lib/utils';
import { ProgressBar } from './charts';
import { useJiraProductivity } from '../use-dashboard';

const MEDALS = ['🥇', '🥈', '🥉'];

export function ProductivityTab({ projectId }: { projectId: number }) {
  const { data, isLoading } = useJiraProductivity(projectId);

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-56" />
        ))}
      </div>
    );
  }

  const payload = data as unknown;
  const errorMessage =
    payload && !Array.isArray(payload) && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : null;
  const errorCode =
    payload && !Array.isArray(payload) && typeof payload === 'object' && 'error_code' in payload
      ? String((payload as { error_code: unknown }).error_code)
      : null;

  if (errorMessage) {
    return (
      <JiraSetupState
        projectId={projectId}
        code={errorCode}
        message={errorMessage}
        icon={<Users />}
      />
    );
  }

  const team = Array.isArray(payload) ? payload : [];

  if (team.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="Sin actividad en Jira"
        description="No hay bugs asignados en los últimos 30 días para calcular productividad."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-footnote font-bold text-fg">Productividad de equipo</h3>
        <p className="text-caption text-fg-muted">
          Balance de carga total y eficiencia de resolución en Jira (últimos 30 días).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {team.map((user, index) => {
          const scoreTone = user.score > 80 ? 'text-ok' : user.score > 50 ? 'text-warn' : 'text-fail';
          const resolutionPct =
            user.totalWork > 0 ? Math.round((user.resolved / user.totalWork) * 100) : 0;

          return (
            <article
              key={user.name}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <header className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative">
                    {user.avatar ? (
                      <img src={user.avatar} alt="" className="size-11 rounded-xl" />
                    ) : (
                      <span className="flex size-11 items-center justify-center rounded-xl bg-fill text-footnote font-bold text-fg-muted">
                        {initials(user.name)}
                      </span>
                    )}
                    {MEDALS[index] ? (
                      <span className="absolute -left-1.5 -top-1.5 text-sm">{MEDALS[index]}</span>
                    ) : null}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-footnote font-semibold text-fg">{user.name}</p>
                    <p className="text-caption uppercase tracking-wide text-fg-subtle">
                      {user.totalWork} bugs totales
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className={cn('text-[24px] font-bold leading-none', scoreTone)}>{user.score}%</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                    Eficiencia
                  </p>
                </div>
              </header>

              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-md bg-fill-soft p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                    Resueltos
                  </p>
                  <p className="text-footnote font-bold text-ok">{user.resolved}</p>
                </div>
                <div className="rounded-md bg-fill-soft p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                    Ciclo medio
                  </p>
                  <p className="text-footnote font-bold text-fg">{user.avgDays}d</p>
                </div>
                <div
                  className={cn(
                    'rounded-md p-2.5',
                    user.avgOpenAge > 14 ? 'bg-fail-soft' : 'bg-fill-soft',
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                    Aging pend.
                  </p>
                  <p
                    className={cn(
                      'text-footnote font-bold',
                      user.avgOpenAge > 14 ? 'text-fail' : 'text-fg',
                    )}
                  >
                    {user.avgOpenAge}d
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-caption text-fg-subtle">
                  <span>Ratio de finalización</span>
                  <span className="font-semibold text-fg-muted">{resolutionPct}%</span>
                </div>
                <ProgressBar value={resolutionPct} tone="ok" />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
