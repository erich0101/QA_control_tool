import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { TestRun } from '@/lib/api/types';
import { groupByDate, inDateRange, MONTH_NAMES } from '../lib/group-by-date';
import { DateRangeFilter } from './date-range-filter';
import { GroupHeader } from './group-header';
import { RunRow } from './run-row';

interface RunsViewProps {
  runs: TestRun[];
  isLoading: boolean;
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onViewBugs: (run: TestRun) => void;
  onRetest: (run: TestRun) => void;
  isRetesting: boolean;
}

export function RunsView({
  runs,
  isLoading,
  total,
  page,
  totalPages,
  onPageChange,
  onViewBugs,
  onRetest,
  isRetesting,
}: RunsViewProps) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const filtered = useMemo(
    () => runs.filter((run) => inDateRange(run.finished_at, from, to)),
    [runs, from, to],
  );

  const tree = useMemo(() => groupByDate(filtered, (run) => run.finished_at), [filtered]);

  if (isLoading && runs.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          icon={<CalendarRange />}
          title="Sin ejecuciones finalizadas"
          description="Cuando finalices un ciclo en Ejecución, va a aparecer acá con sus estadísticas."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <DateRangeFilter
          idPrefix="runs"
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onClear={() => {
            setFrom('');
            setTo('');
          }}
          shown={filtered.length}
          total={runs.length}
          unit="ejecuciones"
        />

        {filtered.length === 0 ? (
          <p className="p-8 text-center text-footnote text-fg-subtle">
            Sin ejecuciones en el rango seleccionado.
          </p>
        ) : (
          <div>
            {tree.map((year) => {
              const yearExpanded = !collapsed.has(year.key);
              return (
                <div key={year.key}>
                  <GroupHeader
                    level={0}
                    label={String(year.year)}
                    count={year.count}
                    unit="ciclo"
                    expanded={yearExpanded}
                    onToggle={() => toggle(year.key)}
                  />

                  {yearExpanded
                    ? year.months.map((month) => {
                        const monthExpanded = !collapsed.has(month.key);
                        return (
                          <div key={month.key}>
                            <GroupHeader
                              level={1}
                              label={MONTH_NAMES[month.month]}
                              count={month.count}
                              unit="ciclo"
                              expanded={monthExpanded}
                              onToggle={() => toggle(month.key)}
                            />

                            {monthExpanded
                              ? month.days.map((day) => {
                                  const dayExpanded = !collapsed.has(day.key);
                                  const date = new Date(
                                    year.year,
                                    month.month,
                                    day.day,
                                  ).toLocaleDateString('es-AR', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                  });

                                  return (
                                    <div key={day.key}>
                                      <GroupHeader
                                        level={2}
                                        label={date}
                                        count={day.items.length}
                                        unit="ciclo"
                                        expanded={dayExpanded}
                                        onToggle={() => toggle(day.key)}
                                      />

                                      {dayExpanded
                                        ? day.items.map((run) => (
                                            <RunRow
                                              key={run.id}
                                              run={run}
                                              isRetesting={
                                                isRetesting
                                              }
                                              onViewBugs={onViewBugs}
                                              onRetest={onRetest}
                                            />
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

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3 text-caption text-fg-muted">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            ‹ Anterior
          </Button>
          <span className="font-semibold">
            Página {page} de {totalPages} · {total} ciclos
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Siguiente ›
          </Button>
        </div>
      ) : (
        <p className="text-center text-caption text-fg-subtle">{total} ciclos en total</p>
      )}
    </div>
  );
}
