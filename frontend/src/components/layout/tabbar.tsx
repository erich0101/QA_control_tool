import { NavLink } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useTestSuites } from '@/features/test-suites/use-test-suites';
import { useUseCases } from '@/features/use-cases/use-use-cases';
import { NAV_ITEMS } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';

/**
 * Barra de navegación. Los tabs salen de NAV_ITEMS y los contadores de
 * TanStack Query (con cache compartida), no de un store paralelo.
 */
export function Tabbar() {
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const activeProjectId = useUiStore((s) => s.activeProjectId);

  const { data: useCases } = useUseCases(activeProjectId);
  const { data: testSuites } = useTestSuites(activeProjectId);

  const counts: Record<string, number> = {
    useCases: useCases?.length ?? 0,
    testSuites: testSuites?.length ?? 0,
  };

  const items = NAV_ITEMS.filter((item) => !item.requiresAdmin || isAdmin);

  return (
    <nav
      className="scrollbar-apple flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2 print:hidden"
      aria-label="Secciones"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const count = item.badge ? counts[item.badge] : 0;

        return (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'group relative flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-footnote font-medium transition-colors',
                isActive
                  ? 'border-brand text-fg'
                  : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('size-4', isActive ? 'text-brand' : 'text-fg-subtle')} />
                <span className="whitespace-nowrap">{item.label}</span>
                {count > 0 ? (
                  <Badge tone={isActive ? 'brand' : 'neutral'} className="px-1.5">
                    {count}
                  </Badge>
                ) : null}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
