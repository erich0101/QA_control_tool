import { useMemo, useState } from 'react';
import { Search, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { TestSuite } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface SuiteListProps {
  suites: TestSuite[];
  isLoading: boolean;
  selectedId: number | null;
  teamNames: Map<number, string>;
  onSelect: (id: number) => void;
}

export function SuiteList({ suites, isLoading, selectedId, teamNames, onSelect }: SuiteListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return suites;
    return suites.filter(
      (suite) =>
        (suite.title ?? '').toLowerCase().includes(term) ||
        String(suite.id).includes(term) ||
        (suite.key_id ?? '').toLowerCase().includes(term),
    );
  }, [suites, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative p-3 pb-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar suite…"
          className="h-8 pl-8 text-footnote"
          aria-label="Buscar test suite"
        />
      </div>

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2 rounded-md border border-border p-2.5">
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-center text-footnote text-fg-subtle">
            {suites.length === 0 ? 'No hay suites en este proyecto.' : 'Sin resultados.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {filtered.map((suite) => {
              const isActive = suite.id === selectedId;
              const isExecuting = Boolean(suite.active_run_id);
              const isIncluded = suite.is_active !== false;
              const testCount = suite.test_cases_count ?? suite.test_cases?.length ?? 0;
              const assigneeName = suite.assigned_to_name
                ? suite.assigned_to_name
                : suite.test_cases?.length
                  ? teamNames.get(Number(suite.test_cases[0].assigned_to)) ?? null
                  : null;

              return (
                <li key={suite.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(suite.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'w-full rounded-md border border-transparent border-l-[3px] px-2.5 py-2 text-left transition-colors',
                      isActive
                        ? 'border-l-brand bg-brand-soft'
                        : 'border-l-transparent hover:bg-fill-soft',
                      !isIncluded && 'bg-warn-soft/60',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'font-mono text-caption font-semibold',
                          isIncluded ? 'text-fg-subtle' : 'text-warn',
                        )}
                      >
                        #{suite.id}
                      </span>
                      {isExecuting ? <Badge tone="ok">LIVE</Badge> : null}
                      {!isIncluded ? (
                        <Badge tone="warn" title="Fuera del gap: no cuenta en cobertura">
                          FUERA DEL GAP
                        </Badge>
                      ) : null}
                      {(suite.inconsistencies?.length ?? 0) > 0 ? (
                        <TriangleAlert
                          className="size-3 text-warn"
                          aria-label="Tiene inconsistencias"
                        />
                      ) : null}
                    </div>

                    <p
                      className={cn(
                        'mt-1 line-clamp-2 text-footnote font-medium leading-snug',
                        isIncluded ? 'text-fg' : 'text-fg-muted line-through decoration-warn',
                      )}
                    >
                      {suite.title}
                    </p>

                    <p className="mt-1 flex items-center gap-2 text-caption text-fg-subtle">
                      <span className="text-brand">{testCount} tests</span>
                      {assigneeName ? <span>· {assigneeName}</span> : null}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="border-t border-border px-3 py-1.5 text-caption text-fg-subtle">
        {suites.length} suites ·{' '}
        {suites.reduce(
          (acc, suite) => acc + (suite.test_cases_count ?? suite.test_cases?.length ?? 0),
          0,
        )}{' '}
        tests
      </p>
    </div>
  );
}
