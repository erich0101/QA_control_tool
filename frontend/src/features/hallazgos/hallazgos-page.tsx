import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lightbulb, Plus, Search, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import {
  HALLZGO_SEVERITIES,
  HALLZGO_STATUSES,
  SUGGESTION_CATEGORIES,
  SUGGESTION_STATUSES,
  type Hallazgo,
  type Suggestion,
} from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';
import { useTeam, useTestSuites } from '@/features/test-suites/use-test-suites';
import { HallazgoPane } from './components/hallazgo-pane';
import { SuggestionPane } from './components/suggestion-pane';
import {
  CategoryBadge,
  HallazgoStatusBadge,
  SeverityBadge,
  SuggestionStatusBadge,
} from './components/badges';
import { useHallazgos, useSuggestions } from './use-hallazgos';

type SubTab = 'bug' | 'suggestion';

const STATUS_ALL = { value: 'all', label: 'Todos' };

export function HallazgosPage() {
  const projectId = useUiStore((s) => s.activeProjectId);
  const canCreate = useSessionStore((s) => s.canManage() || s.can('can_create_cu'));

  const [params, setParams] = useSearchParams();
  const subTab: SubTab = params.get('t') === 'suggestion' ? 'suggestion' : 'bug';
  const selectedId = Number(params.get('id')) || null;
  const isCreating = params.get('new') === '1';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const { data: hallazgos = [], isLoading: loadingHallazgos } = useHallazgos(projectId);
  const { data: suggestions = [], isLoading: loadingSuggestions } = useSuggestions(projectId);
  const { data: team = [] } = useTeam();
  const { data: suites = [] } = useTestSuites(projectId);

  const patchParams = (updates: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  };

  const selectItem = (id: number) => patchParams({ id: String(id), new: null });
  const startCreate = () => patchParams({ id: null, new: '1' });
  const closePane = () => patchParams({ id: null, new: null });

  const hallazgosFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return hallazgos.filter((item) => {
      if (term && !(item.title ?? '').toLowerCase().includes(term)) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (severityFilter !== 'all' && item.severity !== severityFilter) return false;
      return true;
    });
  }, [hallazgos, search, statusFilter, severityFilter]);

  const suggestionsFiltradas = useMemo(() => {
    const term = search.trim().toLowerCase();
    return suggestions.filter((item) => {
      if (term && !(item.title ?? '').toLowerCase().includes(term)) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      return true;
    });
  }, [suggestions, search, statusFilter, categoryFilter]);

  const changeSubTab = (next: SubTab) => {
    setStatusFilter('all');
    setSeverityFilter('all');
    setCategoryFilter('all');
    patchParams({ t: next, id: null, new: null });
  };

  const selectedHallazgo = hallazgos.find((item) => item.id === selectedId) ?? null;
  const selectedSuggestion = suggestions.find((item) => item.id === selectedId) ?? null;

  if (!projectId) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState
          icon={<TriangleAlert />}
          title="Seleccioná un proyecto"
          description="Usá el selector de la barra superior para ver sus hallazgos."
        />
      </div>
    );
  }

  const items = subTab === 'bug' ? hallazgosFiltrados : suggestionsFiltradas;
  const isLoading = subTab === 'bug' ? loadingHallazgos : loadingSuggestions;
  const total = subTab === 'bug' ? hallazgos.length : suggestions.length;

  return (
    <div className="flex h-full min-h-0">
      {/* ── Sidebar ── */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-surface">
        <div className="shrink-0 space-y-2 border-b border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">
              {subTab === 'bug' ? 'Bugs' : 'Sugerencias'}
            </span>
            <Badge tone="neutral">{total}</Badge>
          </div>

          <div className="flex gap-1 rounded-full bg-fill p-1">
            {(
              [
                { id: 'bug', label: 'Bugs' },
                { id: 'suggestion', label: 'Sugerencias' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => changeSubTab(tab.id)}
                aria-pressed={subTab === tab.id}
                className={cn(
                  'flex-1 rounded-full px-3 py-1 text-caption font-semibold transition-colors',
                  subTab === tab.id
                    ? 'bg-brand text-white'
                    : 'text-fg-muted hover:text-fg',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título…"
              className="h-8 pl-8 text-footnote"
              aria-label="Buscar hallazgo"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <SelectField
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="Estado"
              aria-label="Filtrar por estado"
              options={[
                STATUS_ALL,
                ...(subTab === 'bug' ? HALLZGO_STATUSES : SUGGESTION_STATUSES).map((value) => ({
                  value,
                  label: value,
                })),
              ]}
            />

            {subTab === 'bug' ? (
              <SelectField
                value={severityFilter}
                onValueChange={setSeverityFilter}
                placeholder="Severidad"
                aria-label="Filtrar por severidad"
                options={[
                  { value: 'all', label: 'Todas' },
                  ...HALLZGO_SEVERITIES.map((value) => ({ value, label: value })),
                ]}
              />
            ) : (
              <SelectField
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                placeholder="Categoría"
                aria-label="Filtrar por categoría"
                options={[
                  { value: 'all', label: 'Todas' },
                  ...SUGGESTION_CATEGORIES.map((value) => ({ value, label: value })),
                ]}
              />
            )}
          </div>

          {canCreate ? (
            <Button variant="primary" size="sm" className="w-full" onClick={startCreate}>
              <Plus />
              {subTab === 'bug' ? 'Nuevo hallazgo' : 'Nueva sugerencia'}
            </Button>
          ) : null}
        </div>

        <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="space-y-1.5 rounded-md p-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="p-4 text-center text-footnote text-fg-subtle">
              {total === 0
                ? `No hay ${subTab === 'bug' ? 'hallazgos' : 'sugerencias'} en este proyecto.`
                : 'Sin resultados para los filtros.'}
            </p>
          ) : (
            <ul className="space-y-1">
              {subTab === 'bug'
                ? hallazgosFiltrados.map((hallazgo) => (
                    <HallazgoListItem
                      key={hallazgo.id}
                      hallazgo={hallazgo}
                      isActive={hallazgo.id === selectedId}
                      onSelect={() => selectItem(hallazgo.id)}
                    />
                  ))
                : suggestionsFiltradas.map((suggestion) => (
                    <SuggestionListItem
                      key={suggestion.id}
                      suggestion={suggestion}
                      isActive={suggestion.id === selectedId}
                      onSelect={() => selectItem(suggestion.id)}
                    />
                  ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Detalle / alta ── */}
      <section className="min-w-0 flex-1">
        {isCreating ? (
          subTab === 'bug' ? (
            <HallazgoPane
              projectId={projectId}
              team={team}
              suites={suites}
              onCreated={(id) => selectItem(id)}
              onDeleted={closePane}
              onCancel={closePane}
            />
          ) : (
            <SuggestionPane
              projectId={projectId}
              team={team}
              onCreated={(id) => selectItem(id)}
              onDeleted={closePane}
              onCancel={closePane}
            />
          )
        ) : subTab === 'bug' && selectedHallazgo ? (
          <HallazgoPane
            key={selectedHallazgo.id}
            hallazgo={selectedHallazgo}
            projectId={projectId}
            team={team}
            suites={suites}
            onCreated={selectItem}
            onDeleted={closePane}
            onCancel={closePane}
          />
        ) : subTab === 'suggestion' && selectedSuggestion ? (
          <SuggestionPane
            key={selectedSuggestion.id}
            suggestion={selectedSuggestion}
            projectId={projectId}
            team={team}
            onCreated={selectItem}
            onDeleted={closePane}
            onCancel={closePane}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={subTab === 'bug' ? <TriangleAlert /> : <Lightbulb />}
              title={
                subTab === 'bug' ? 'Seleccioná un hallazgo' : 'Seleccioná una sugerencia'
              }
              description="Hacé clic en un ítem de la izquierda para ver y editar sus datos, o creá uno nuevo."
              action={
                canCreate ? (
                  <Button variant="primary" onClick={startCreate}>
                    <Plus />
                    {subTab === 'bug' ? 'Nuevo hallazgo' : 'Nueva sugerencia'}
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}

function HallazgoListItem({
  hallazgo,
  isActive,
  onSelect,
}: {
  hallazgo: Hallazgo;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? 'true' : undefined}
        className={cn(
          'w-full rounded-md border border-transparent border-l-[3px] px-2.5 py-2 text-left transition-colors',
          isActive ? 'border-l-brand bg-brand-soft' : 'border-l-transparent hover:bg-fill-soft',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-caption text-fg-subtle">#{hallazgo.id}</span>
          <HallazgoStatusBadge status={hallazgo.status} />
        </div>
        <p className="mt-1 line-clamp-2 text-footnote font-medium leading-snug text-fg">
          {hallazgo.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={hallazgo.severity} />
          {hallazgo.component ? (
            <span className="text-caption text-fg-subtle">{hallazgo.component}</span>
          ) : null}
          {hallazgo.assignee_name ? (
            <span className="text-caption text-fg-subtle">· {hallazgo.assignee_name}</span>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function SuggestionListItem({
  suggestion,
  isActive,
  onSelect,
}: {
  suggestion: Suggestion;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? 'true' : undefined}
        className={cn(
          'w-full rounded-md border border-transparent border-l-[3px] px-2.5 py-2 text-left transition-colors',
          isActive ? 'border-l-brand bg-brand-soft' : 'border-l-transparent hover:bg-fill-soft',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-caption text-fg-subtle">#{suggestion.id}</span>
          <SuggestionStatusBadge status={suggestion.status} />
        </div>
        <p className="mt-1 line-clamp-2 text-footnote font-medium leading-snug text-fg">
          {suggestion.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={suggestion.category} />
          <span className="text-caption text-fg-subtle">{suggestion.priority ?? 'Media'}</span>
        </div>
      </button>
    </li>
  );
}
