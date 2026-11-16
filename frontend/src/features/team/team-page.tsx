import { useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import type { User } from '@/lib/api/types';
import { useProjects } from '@/features/projects/use-projects';
import { UserCard } from './components/user-card';
import { UserDialog } from './components/user-dialog';
import { useTeam, useUserMutations } from './use-team';

export function TeamPage() {
  const { data: team = [], isLoading } = useTeam();
  const { data: projects = [] } = useProjects();
  const { create, update } = useUserMutations();

  const [search, setSearch] = useState('');
  const [dialogUser, setDialogUser] = useState<User | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = team.filter((user) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      (user.name ?? '').toLowerCase().includes(term) ||
      (user.email ?? '').toLowerCase().includes(term) ||
      (user.role ?? '').toLowerCase().includes(term)
    );
  });

  const admins = team.filter((user) => user.perfil === 'admin').length;

  const openCreate = () => {
    setDialogUser(null);
    setDialogOpen(true);
  };

  const openEdit = (user: User) => {
    setDialogUser(user);
    setDialogOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        className="shrink-0"
        eyebrow="Equipo"
        title="Usuarios del equipo"
        description={`${team.length} usuarios · ${admins} admin`}
        actions={
          <>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre, email o rol…"
                className="h-8 pl-8 text-footnote"
                aria-label="Buscar usuario"
              />
            </div>

            <Button variant="primary" size="sm" onClick={openCreate}>
              <Plus />
              Nuevo usuario
            </Button>
          </>
        }
      />

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-64 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={team.length === 0 ? 'Sin usuarios' : 'Sin resultados'}
            description={
              team.length === 0
                ? 'Creá el primer usuario del equipo.'
                : 'Probá con otro nombre, email o rol.'
            }
            action={
              team.length === 0 ? (
                <Button variant="primary" onClick={openCreate}>
                  <Plus />
                  Nuevo usuario
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                projects={projects}
                onEdit={() => openEdit(user)}
              />
            ))}
          </div>
        )}
      </div>

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={dialogUser}
        projects={projects}
        isPending={create.isPending || update.isPending}
        onSubmit={async (input) => {
          if (dialogUser) {
            await update.mutateAsync({ id: dialogUser.id, input });
          } else {
            await create.mutateAsync(input);
          }
        }}
      />
    </div>
  );
}
