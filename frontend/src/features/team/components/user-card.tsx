import { Pencil, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Project, User } from '@/lib/api/types';
import { cn, initials } from '@/lib/utils';
import { ALL_PERMISSIONS } from '../lib/permissions';

export function UserCard({
  user,
  projects,
  onEdit,
}: {
  user: User;
  projects: Project[];
  onEdit: () => void;
}) {
  const isAdmin = user.perfil === 'admin';
  const granted = ALL_PERMISSIONS.filter((permission) =>
    isAdmin ? true : Boolean(user[permission.key]),
  );
  const userProjects = (user.projects ?? [])
    .map((id) => projects.find((project) => project.id === id))
    .filter((project): project is Project => Boolean(project));

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand/50">
      <header className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-footnote font-bold text-white">
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-footnote font-semibold text-fg">{user.name}</p>
          <p className="truncate text-caption text-fg-subtle" title={user.email}>
            {user.email}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        {isAdmin ? (
          <Badge tone="fail" className="gap-1">
            <ShieldCheck className="size-3" />
            Admin
          </Badge>
        ) : (
          <Badge tone="neutral">{user.perfil ?? 'user'}</Badge>
        )}
        {user.role && user.role !== 'Admin' ? <Badge tone="brand">{user.role}</Badge> : null}
      </div>

      <div>
        <p className="mb-1 text-caption font-bold uppercase tracking-wide text-fg-subtle">
          Proyectos
        </p>
        {userProjects.length === 0 ? (
          <p className="text-caption italic text-fg-subtle">Sin proyectos asignados</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {userProjects.map((project) => (
              <li
                key={project.id}
                className="rounded bg-accent/15 px-2 py-0.5 text-caption font-medium text-accent"
              >
                {project.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-caption font-bold uppercase tracking-wide text-fg-subtle">Permisos</p>
          <span className="text-caption text-fg-subtle">
            {isAdmin ? 'Todos (admin)' : `${granted.length}/${ALL_PERMISSIONS.length}`}
          </span>
        </div>

        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {ALL_PERMISSIONS.map((permission) => {
            const on = isAdmin || Boolean(user[permission.key]);
            return (
              <li
                key={permission.key}
                className={cn(
                  'flex items-center gap-1.5 text-caption',
                  on ? 'text-fg-muted' : 'text-fg-subtle/70',
                )}
                title={`${permission.label}: ${on ? 'sí' : 'no'}`}
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    on ? 'bg-ok' : 'bg-fail/40',
                  )}
                />
                <span className={cn('truncate', !on && 'line-through decoration-1')}>
                  {permission.short}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-auto flex justify-end border-t border-border pt-2">
        <Button variant="secondary" size="sm" onClick={onEdit}>
          <Pencil />
          Editar
        </Button>
      </div>
    </article>
  );
}
