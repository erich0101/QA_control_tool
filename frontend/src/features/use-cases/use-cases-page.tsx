import { useEffect, useState } from 'react';
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SelectField } from '@/components/ui/select-field';
import { useSessionStore } from '@/stores/session';
import { useUiStore } from '@/stores/ui';
import { UserStoryDetail } from './components/user-story-detail';
import { UserStoryDialog } from './components/user-story-dialog';
import { UserStoryList } from './components/user-story-list';
import { UseCaseDialog } from './components/use-case-dialog';
import { useStoryParams } from './lib/params';
import { useDeleteUseCase, useUseCases, useUserStories } from './use-use-cases';

type DialogMode = 'cu-create' | 'cu-edit' | 'hu-create' | null;

export function UseCasesPage() {
  const projectId = useUiStore((s) => s.activeProjectId);
  const canManage = useSessionStore((s) => s.canManage());
  const canCreateHu = useSessionStore((s) => s.canManage() || s.can('can_create_hu'));
  const confirm = useConfirm();

  const { useCaseId, storyId, selectUseCase, selectStory } = useStoryParams();
  const [dialog, setDialog] = useState<DialogMode>(null);

  const { data: useCases = [], isLoading: loadingUseCases } = useUseCases(projectId);
  const { data: stories = [], isLoading: loadingStories } = useUserStories(useCaseId);

  const activeUseCase = useCases.find((item) => item.id === useCaseId) ?? null;
  const selectedStory = stories.find((item) => item.id === storyId) ?? null;

  // Mantiene la URL consistente: si el CU no existe (o no hay), selecciona el primero.
  useEffect(() => {
    if (loadingUseCases || useCases.length === 0) return;
    if (!useCaseId || !useCases.some((item) => item.id === useCaseId)) {
      selectUseCase(useCases[0].id);
    }
  }, [loadingUseCases, useCases, useCaseId, selectUseCase]);

  const deleteUseCase = useDeleteUseCase(projectId);

  const handleDeleteUseCase = async () => {
    if (!activeUseCase) return;

    const ok = await confirm({
      title: 'Eliminar caso de uso',
      description:
        `¿Eliminar “${activeUseCase.key_id} — ${activeUseCase.title}”?\n\n` +
        `Se eliminarán también sus historias de usuario (${stories.length}), ` +
        'test suites, tests, escenarios y ejecuciones asociadas.\n\n' +
        'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar caso de uso',
      destructive: true,
    });
    if (!ok) return;

    await deleteUseCase.mutateAsync(activeUseCase.id);
    selectUseCase(null);
  };

  if (!projectId) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState
          icon={<ClipboardList />}
          title="Seleccioná un proyecto"
          description="Usá el selector de la barra superior para ver sus casos de uso."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Maestro: casos de uso + historias ── */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-surface">
        <div className="shrink-0 space-y-2 border-b border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">
              Casos de uso
            </span>
            <Badge tone="neutral">{useCases.length}</Badge>
          </div>

          {loadingUseCases ? (
            <Skeleton className="h-9 w-full" />
          ) : useCases.length === 0 ? (
            <p className="text-footnote text-fg-subtle">El proyecto no tiene casos de uso.</p>
          ) : (
            <div className="flex items-center gap-1">
              <SelectField
                className="flex-1"
                value={useCaseId ? String(useCaseId) : ''}
                onValueChange={(value) => selectUseCase(Number(value))}
                placeholder="Elegir caso de uso"
                aria-label="Caso de uso"
                options={useCases.map((item) => ({
                  value: String(item.id),
                  label: `${item.key_id} · ${item.title}${item.us_count ? ` (${item.us_count})` : ''}`,
                }))}
              />

              {canManage && activeUseCase ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-label="Editar caso de uso"
                        onClick={() => setDialog('cu-edit')}
                      >
                        <Pencil />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Editar caso de uso</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 text-fail"
                        aria-label="Eliminar caso de uso"
                        onClick={handleDeleteUseCase}
                        loading={deleteUseCase.isPending}
                      >
                        <Trash2 />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Eliminar caso de uso</TooltipContent>
                  </Tooltip>
                </>
              ) : null}
            </div>
          )}

          <div className="flex gap-2">
            {canManage ? (
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setDialog('cu-create')}>
                <Plus />
                Nuevo CU
              </Button>
            ) : null}

            {canCreateHu && useCaseId ? (
              <Button variant="primary" size="sm" className="flex-1" onClick={() => setDialog('hu-create')}>
                <Plus />
                Nueva HU
              </Button>
            ) : null}
          </div>
        </div>

        <UserStoryList
          stories={stories}
          isLoading={loadingStories}
          selectedId={storyId}
          onSelect={selectStory}
        />
      </aside>

      {/* ── Detalle ── */}
      <section className="flex min-w-0 flex-1 flex-col">
        {selectedStory ? (
          <UserStoryDetail
            key={selectedStory.id}
            story={selectedStory}
            projectId={projectId}
            useCaseId={useCaseId}
            onDeleted={() => selectStory(null)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState
              icon={<ClipboardList />}
              title={stories.length === 0 ? 'Sin historias de usuario' : 'Seleccioná una historia'}
              description={
                stories.length === 0
                  ? 'Creá la primera HU de este caso de uso para empezar el análisis.'
                  : 'Hacé clic en una HU de la izquierda para ver su análisis, escenarios y documentación.'
              }
              action={
                canCreateHu && useCaseId && stories.length === 0 ? (
                  <Button variant="primary" onClick={() => setDialog('hu-create')}>
                    <Plus />
                    Nueva HU
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </section>

      <UseCaseDialog
        open={dialog === 'cu-create' || dialog === 'cu-edit'}
        onOpenChange={(open) => setDialog(open ? dialog ?? 'cu-create' : null)}
        projectId={projectId}
        useCase={dialog === 'cu-edit' ? activeUseCase : null}
        onCreated={(id) => selectUseCase(id)}
      />

      <UserStoryDialog
        open={dialog === 'hu-create'}
        onOpenChange={(open) => setDialog(open ? 'hu-create' : null)}
        projectId={projectId}
        useCaseId={useCaseId}
        onCreated={(id) => selectStory(id)}
      />
    </div>
  );
}
