import { FolderOpen } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects } from '@/features/projects/use-projects';
import { useUiStore } from '@/stores/ui';

/** Selector de proyecto activo (reemplaza el <select> del topbar vanilla). */
export function ProjectSwitcher() {
  const { data: projects, isLoading } = useProjects();
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId);

  if (isLoading) return <Skeleton className="h-9 w-52" />;

  if (!projects?.length) {
    return (
      <span className="flex h-9 items-center gap-2 rounded-md border border-dashed border-border px-3 text-footnote text-fg-subtle">
        <FolderOpen className="size-4" />
        Sin proyectos
      </span>
    );
  }

  return (
    <Select
      value={activeProjectId ? String(activeProjectId) : ''}
      onValueChange={(value) => setActiveProjectId(Number(value))}
    >
      <SelectTrigger className="w-56" aria-label="Proyecto activo">
        <SelectValue placeholder="Elegir proyecto" />
      </SelectTrigger>
      <SelectContent>
        {projects.map((project) => (
          <SelectItem key={project.id} value={String(project.id)}>
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
