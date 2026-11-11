import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ProjectDialog } from '@/features/projects/project-dialog';
import { useProjects } from '@/features/projects/use-projects';
import { useSessionStore } from '@/stores/session';
import { applyTheme, useUiStore } from '@/stores/ui';
import { Tabbar } from './tabbar';
import { Topbar } from './topbar';

export function AppShell() {
  const theme = useUiStore((s) => s.theme);
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId);
  const isAdmin = useSessionStore((s) => s.isAdmin());

  const { data: projects = [], isLoading } = useProjects();
  const [noProjectDialogOpen, setNoProjectDialogOpen] = useState(false);

  // Aplica el tema persistido al montar.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Auto-selecciona un proyecto válido (o el primero) si no hay uno persistido.
  useEffect(() => {
    if (isLoading || !projects.length) return;
    const exists = projects.some((p) => p.id === activeProjectId);
    if (!exists) {
      const preferred = projects.find((p) => p.status === 'ACTIVE') ?? projects[0];
      setActiveProjectId(preferred.id);
    }
  }, [isLoading, projects, activeProjectId, setActiveProjectId]);

  const hasNoProject = !isLoading && projects.length === 0;

  return (
    <div className="flex h-full flex-col bg-bg">
      <Topbar />
      <Tabbar />

      <main className="scrollbar-apple flex-1 overflow-y-auto">
        {hasNoProject ? (
          <div className="mx-auto max-w-xl p-10">
            <EmptyState
              icon={<FolderPlus />}
              title="Todavía no hay proyectos"
              description={
                isAdmin
                  ? 'Creá el primer proyecto para empezar a cargar casos de uso y test suites.'
                  : 'Pedile a un administrador que te asigne a un proyecto.'
              }
              action={
                isAdmin ? (
                  <Button variant="primary" onClick={() => setNoProjectDialogOpen(true)}>
                    Crear proyecto
                  </Button>
                ) : undefined
              }
            />
            <ProjectDialog open={noProjectDialogOpen} onOpenChange={setNoProjectDialogOpen} />
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
