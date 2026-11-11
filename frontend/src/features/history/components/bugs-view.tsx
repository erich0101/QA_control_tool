import { useMemo, useState } from 'react';
import { Bug } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { Defect } from '@/lib/api/types';
import { groupByDate, inDateRange, MONTH_NAMES } from '../lib/group-by-date';
import { BugRow } from './bug-row';
import { DateRangeFilter } from './date-range-filter';
import { GroupHeader } from './group-header';

interface BugsViewProps {
  bugs: Defect[];
  isLoading: boolean;
  onDismiss: (bug: Defect) => void;
  isBusy: boolean;
}

const isCritical = (bug: Defect) => bug.severity === 'Crítica' || bug.severity === 'Alta';

export function BugsView({ bugs, isLoading, onDismiss, isBusy }: BugsViewProps) {
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
    () => bugs.filter((bug) => inDateRange(bug.created_at, from, to)),
    [bugs, from, to],
  );

  const tree = useMemo(() => groupByDate(filtered, (bug) => bug.created_at), [filtered]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (bugs.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          icon={<Bug />}
          title="Sin defectos registrados"
          description="Los bugs que reportes durante la ejecución (resultado FAIL) aparecen acá."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <DateRangeFilter
        idPrefix="bugs"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onClear={() => {
          setFrom('');
          setTo('');
        }}
        shown={filtered.length}
        total={bugs.length}
        unit="bugs"
      />

      {filtered.length === 0 ? (
        <p className="p-8 text-center text-footnote text-fg-subtle">
          Sin bugs en el rango seleccionado.
        </p>
      ) : (
        <div>
          {tree.map((year) => {
            const yearExpanded = !collapsed.has(year.key);
            const yearCritical = year.months
              .flatMap((month) => month.days)
              .flatMap((day) => day.items)
              .filter(isCritical).length;

            return (
              <div key={year.key}>
                <GroupHeader
                  level={0}
                  label={String(year.year)}
                  count={year.count}
                  unit="bug"
                  critical={yearCritical}
                  expanded={yearExpanded}
                  onToggle={() => toggle(year.key)}
                />

                {yearExpanded
                  ? year.months.map((month) => {
                      const monthExpanded = !collapsed.has(month.key);
                      const monthCritical = month.days
                        .flatMap((day) => day.items)
                        .filter(isCritical).length;

                      return (
                        <div key={month.key}>
                          <GroupHeader
                            level={1}
                            label={MONTH_NAMES[month.month]}
                            count={month.count}
                            unit="bug"
                            critical={monthCritical}
                            expanded={monthExpanded}
                            onToggle={() => toggle(month.key)}
                          />

                          {monthExpanded
                            ? month.days.map((day) => {
                                const dayExpanded = !collapsed.has(day.key);
                                const dayCritical = day.items.filter(isCritical).length;
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
                                      unit="bug"
                                      critical={dayCritical}
                                      expanded={dayExpanded}
                                      onToggle={() => toggle(day.key)}
                                    />

                                    {dayExpanded
                                      ? day.items.map((bug) => (
                                          <BugRow
                                            key={bug.id}
                                            bug={bug}
                                            onDismiss={onDismiss}
                                            isBusy={isBusy}
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
  );
}
