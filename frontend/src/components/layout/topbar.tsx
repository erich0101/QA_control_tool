import { useState } from 'react';
import { Download, FlaskConical, Pencil, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProjectDialog } from '@/features/projects/project-dialog';
import { useProjects } from '@/features/projects/use-projects';
import { projectsApi } from '@/lib/api/projects';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';
import { ProjectSwitcher } from './project-switcher';
import { UserMenu } from './user-menu';

export function Topbar() {
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const canConfigureJira = useSessionStore((s) => s.can('can_configure_jira'));
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const { data: projects } = useProjects();

  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);

  const activeProject = projects?.find((p) => p.id === activeProjectId) ?? null;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <FlaskConical className="size-5" />
        </div>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold text-fg">Manual QA</h1>
          <p className="text-caption text-fg-subtle">JIRA Edition</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ProjectSwitcher />

        {isAdmin ? (
          <Button variant="primary" size="sm" onClick={() => setDialogMode('create')}>
            <Plus />
            Proyecto
          </Button>
        ) : null}

        {activeProject && isAdmin ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => setDialogMode('edit')} aria-label="Editar proyecto">
                <Pencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Editar proyecto</TooltipContent>
          </Tooltip>
        ) : null}

        {activeProject && (isAdmin || canConfigureJira) ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Configurar JIRA"
                onClick={() =>
                  toast.info('La configuración de JIRA se migra junto con el módulo Tools')
                }
              >
                <Settings2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Configurar JIRA</TooltipContent>
          </Tooltip>
        ) : null}

        {activeProject ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Exportar matriz"
                onClick={() => projectsApi.exportMatrix(activeProject.id)}
              >
                <Download />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Exportar matriz</TooltipContent>
          </Tooltip>
        ) : null}

        <div className="mx-1 h-6 w-px bg-border" aria-hidden />

        <UserMenu />
      </div>

      <ProjectDialog
        open={dialogMode !== null}
        onOpenChange={(open) => setDialogMode(open ? (dialogMode ?? 'create') : null)}
        project={dialogMode === 'edit' ? activeProject : null}
      />
    </header>
  );
}
