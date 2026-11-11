import { useMemo, useState } from 'react';
import { ChevronRight, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { KpiCard } from './charts';
import { useSuiteStats } from '../use-dashboard';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function toIsoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

function formatMinutes(minutes: number) {
  if (!minutes) return '0m';
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  return `${hours}h ${Math.round(total % 60)}m`;
}

function pluralRuns(count: number) {
  return `${count} ${count === 1 ? 'ejecución' : 'ejecuciones'}`;
}

interface RunRow {
  id?: number;
  suite_id: number;
  suite_title: string;
  finished_at?: string;
  minutes?: number;
}

export function PerformanceTab({ projectId }: { projectId: number }) {
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return toIsoDate(date);
  });
  const [to, setTo] = useState(() => toIsoDate(new Date()));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: stats = [], isLoading, isFetching, refetch } = useSuiteStats(projectId, from, to);

  const runs = useMemo<RunRow[]>(
    () =>
      stats.flatMap((suite) =>
        (suite.runs ?? [])
          .filter((run) => Boolean(run.finished_at))
          .map((run) => ({
            id: run.id,
            finished_at: run.finished_at,
            minutes: Number(run.minutes ?? 0),
            suite_id: suite.id,
            suite_title: suite.title,
          })),
      ),
    [stats],
  );

  const tree = useMemo(() => {
    const map = new Map<number, Map<number, Map<number, RunRow[]>>>();

    for (const run of runs) {
      const date = new Date(run.finished_at as string);
      if (Number.isNaN(date.getTime())) continue;
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();

      if (!map.has(year)) map.set(year, new Map());
      const months = map.get(year)!;
      if (!months.has(month)) months.set(month, new Map());
      const days = months.get(month)!;
      if (!days.has(day)) days.set(day, []);
      days.get(day)!.push(run);
    }

    return [...map.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, months]) => ({
        year,
        totalRuns: [...months.values()].reduce(
          (acc, days) => acc + [...days.values()].reduce((a, d) => a + d.length, 0),
          0,
        ),
        totalMinutes: [...months.values()].reduce(
          (acc, days) =>
            acc + [...days.values()].reduce((a, d) => a + d.reduce((sum, r) => sum + (r.minutes ?? 0), 0), 0),
          0,
        ),
        months: [...months.entries()]
          .sort(([a], [b]) => b - a)
          .map(([month, days]) => ({
            month,
            totalRuns: [...days.values()].reduce((acc, d) => acc + d.length, 0),
            totalMinutes: [...days.values()].reduce(
              (acc, d) => acc + d.reduce((sum, r) => sum + (r.minutes ?? 0), 0),
              0,
            ),
            days: [...days.entries()]
              .sort(([a], [b]) => b - a)
              .map(([day, dayRuns]) => ({
                day,
                runs: dayRuns,
                minutes: dayRuns.reduce((acc, r) => acc + (r.minutes ?? 0), 0),
              })),
          })),
      }));
  }, [runs]);

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const totalRuns = stats.reduce((acc, suite) => acc + Number(suite.total_runs ?? 0), 0);
  const totalMinutes = stats.reduce((acc, suite) => acc + Number(suite.total_minutes ?? 0), 0);
  const avgMinutes =
    stats.length > 0
      ? stats.reduce((acc, suite) => acc + Number(suite.avg_minutes ?? 0), 0) / stats.length
      : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
          Métricas de rendimiento y ciclo de vida
        </h3>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-8 w-36 text-caption"
            aria-label="Desde"
          />
          <span className="text-caption text-fg-subtle">→</span>
          <Input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-8 w-36 text-caption"
            aria-label="Hasta"
          />
          <Button variant="secondary" size="sm" loading={isFetching} onClick={() => refetch()}>
            Aplicar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Total ejecuciones" value={totalRuns} tone="brand" />
        <KpiCard label="Tiempo total" value={formatMinutes(totalMinutes)} tone="ok" />
        <KpiCard label="Promedio por suite" value={formatMinutes(avgMinutes)} tone="warn" />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<Timer />}
          title="Sin ejecuciones en el periodo"
          description="Probá ampliar el rango de fechas o finalizá ciclos en Ejecución."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid grid-cols-[1fr_90px_110px_120px] border-b border-border bg-fill-soft px-4 py-2 text-caption uppercase tracking-wide text-fg-subtle">
            <span>Periodo / suite</span>
            <span className="text-center">Ejecuciones</span>
            <span className="text-center">Promedio</span>
            <span className="text-center">Total</span>
          </div>

          {tree.map((year) => {
            const yearOpen = !collapsed.has(`y-${year.year}`);
            return (
              <div key={year.year}>
                <button
                  type="button"
                  onClick={() => toggle(`y-${year.year}`)}
                  className="flex w-full items-center gap-2 border-b border-border bg-surface-2 px-4 py-2 text-left hover:bg-fill-soft"
                >
                  <ChevronRight
                    className={cn('size-3.5 text-fg-subtle transition-transform', yearOpen && 'rotate-90')}
                  />
                  <span className="text-footnote font-bold text-fg">{year.year}</span>
                  <span className="text-caption text-fg-subtle">{pluralRuns(year.totalRuns)}</span>
                  <span className="ml-auto text-caption font-semibold text-ok">
                    {formatMinutes(year.totalMinutes)} total
                  </span>
                </button>

                {yearOpen
                  ? year.months.map((month) => {
                      const monthKey = `m-${year.year}-${month.month}`;
                      const monthOpen = !collapsed.has(monthKey);
                      return (
                        <div key={monthKey}>
                          <button
                            type="button"
                            onClick={() => toggle(monthKey)}
                            className="flex w-full items-center gap-2 border-b border-border bg-surface-2/60 px-4 py-1.5 pl-8 text-left hover:bg-fill-soft"
                          >
                            <ChevronRight
                              className={cn('size-3 text-fg-subtle transition-transform', monthOpen && 'rotate-90')}
                            />
                            <span className="text-caption font-semibold text-fg">
                              {MONTHS[month.month]}
                            </span>
                            <span className="text-caption text-fg-subtle">
                              {pluralRuns(month.totalRuns)}
                            </span>
                            <span className="ml-auto text-caption font-semibold text-warn">
                              {formatMinutes(month.totalMinutes)}
                            </span>
                          </button>

                          {monthOpen
                            ? month.days.map((day) => {
                                const dayKey = `d-${year.year}-${month.month}-${day.day}`;
                                const dayOpen = !collapsed.has(dayKey);
                                const label = new Date(year.year, month.month, day.day).toLocaleDateString(
                                  'es-AR',
                                  { weekday: 'short', day: 'numeric' },
                                );

                                // Agregado por suite dentro del día.
                                const bySuite = new Map<number, { title: string; runs: number; minutes: number }>();
                                for (const run of day.runs) {
                                  const entry = bySuite.get(run.suite_id) ?? {
                                    title: run.suite_title,
                                    runs: 0,
                                    minutes: 0,
                                  };
                                  entry.runs += 1;
                                  entry.minutes += run.minutes ?? 0;
                                  bySuite.set(run.suite_id, entry);
                                }

                                return (
                                  <div key={dayKey}>
                                    <button
                                      type="button"
                                      onClick={() => toggle(dayKey)}
                                      className="flex w-full items-center gap-2 border-b border-border px-4 py-1.5 pl-12 text-left hover:bg-fill-soft"
                                    >
                                      <ChevronRight
                                        className={cn(
                                          'size-3 text-fg-subtle transition-transform',
                                          dayOpen && 'rotate-90',
                                        )}
                                      />
                                      <span className="text-caption font-medium text-fg">{label}</span>
                                      <span className="ml-auto text-caption text-fg-subtle">
                                        {pluralRuns(day.runs.length)} · {formatMinutes(day.minutes)}
                                      </span>
                                    </button>

                                    {dayOpen
                                      ? [...bySuite.entries()].map(([suiteId, entry]) => (
                                          <div
                                            key={`${dayKey}-${suiteId}`}
                                            className="grid grid-cols-[1fr_90px_110px_120px] border-b border-border px-4 py-2 pl-16 text-caption"
                                          >
                                            <div className="min-w-0">
                                              <p className="truncate font-semibold text-fg">{entry.title}</p>
                                              <p className="text-[10px] text-fg-subtle">
                                                Suite #{suiteId} · {entry.runs} corrida(s)
                                              </p>
                                            </div>
                                            <span className="self-center text-center font-bold text-brand">
                                              {entry.runs}
                                            </span>
                                            <span className="self-center text-center font-mono text-warn">
                                              {formatMinutes(entry.minutes / entry.runs)}
                                            </span>
                                            <span className="self-center text-center font-mono font-bold text-ok">
                                              {formatMinutes(entry.minutes)}
                                            </span>
                                          </div>
                                        ))
                                      : null}
                                  </div>
                                );
                              })
                            : null}
                        </div>
                      );
                    })
                  : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
