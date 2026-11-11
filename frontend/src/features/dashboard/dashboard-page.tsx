import { useSearchParams } from 'react-router-dom';
import { BarChart3, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LEGACY_APP_URL } from '@/lib/env';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { DailyTab } from './components/daily-tab';
import { OverviewTab } from './components/overview-tab';
import { PerformanceTab } from './components/performance-tab';
import { ProductivityTab } from './components/productivity-tab';

const TABS = [
  { id: 'overview', label: 'Vista general' },
  { id: 'performance', label: 'Control & Tiempos' },
  { id: 'daily', label: 'Jira & Daily' },
  { id: 'team', label: 'Productividad' },
  { id: 'epic', label: 'Reporte cliente' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function DashboardPage() {
  const projectId = useUiStore((s) => s.activeProjectId);
  const [params, setParams] = useSearchParams();

  const raw = params.get('v');
  const active: TabId = (TABS.find((tab) => tab.id === raw)?.id ?? 'overview') as TabId;

  const setActive = (id: TabId) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === 'overview') next.delete('v');
        else next.set('v', id);
        return next;
      },
      { replace: true },
    );
  };

  if (!projectId) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState
          icon={<BarChart3 />}
          title="Seleccioná un proyecto"
          description="Usá el selector de la barra superior para ver las métricas."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-surface px-5">
        <div className="flex items-center gap-3 pt-2.5">
          <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
            Dashboard del proyecto
          </span>
        </div>

        <nav className="flex gap-4 overflow-x-auto" aria-label="Secciones del dashboard">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              aria-current={active === tab.id ? 'page' : undefined}
              className={cn(
                'shrink-0 border-b-2 px-1 py-2 text-footnote font-semibold transition-colors',
                active === tab.id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-5">
        {active === 'overview' ? <OverviewTab projectId={projectId} /> : null}
        {active === 'performance' ? <PerformanceTab projectId={projectId} /> : null}
        {active === 'daily' ? <DailyTab projectId={projectId} /> : null}
        {active === 'team' ? <ProductivityTab projectId={projectId} /> : null}
        {active === 'epic' ? (
          <EmptyState
            icon={<FileText />}
            title="Reporte cliente · en migración"
            description="El generador de reporte por épica (con selección de fechas y exportación) todavía vive en la versión anterior de la app."
            action={
              <Button variant="secondary" asChild>
                <a href={LEGACY_APP_URL}>Abrir en la versión anterior</a>
              </Button>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
