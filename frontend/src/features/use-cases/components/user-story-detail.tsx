import { Controller, useForm } from 'react-hook-form';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FlaskConical, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  STORY_PRIORITIES,
  STORY_STATUSES,
  type Inconsistency,
  type UserStory,
} from '@/lib/api/types';
import { parseRecommendations } from '../lib/documentation';
import { buildStoryPatch, storyToForm, type StoryFormValues } from '../lib/story-form';
import { useDeleteUserStory, useStoryChildren, useUpdateUserStory } from '../use-use-cases';
import { InconsistenciesTab } from './story-tabs/inconsistencies-tab';
import { RecommendationsTab } from './story-tabs/recommendations-tab';
import { ScenariosTab } from './story-tabs/scenarios-tab';
import { TextareaTab } from './story-tabs/textarea-tab';

// El renderizador de Markdown (react-markdown + remark-gfm) es la dependencia
// más pesada del tab: se carga recién cuando el usuario abre Documentación.
const DocumentationTab = lazy(() =>
  import('./story-tabs/documentation-tab').then((module) => ({
    default: module.DocumentationTab,
  })),
);

const STATUS_OPTIONS = STORY_STATUSES.map((value) => ({ value, label: value }));
const PRIORITY_OPTIONS = STORY_PRIORITIES.map((value) => ({ value, label: value }));

interface UserStoryDetailProps {
  story: UserStory;
  projectId: number | null;
  useCaseId: number | null;
  onDeleted: () => void;
}

/**
 * Detalle de una HU.
 *
 * Diferencia clave con la UI legacy: el formulario tiene estado propio y
 * "Guardar" manda SOLO los campos modificados (dirty), en vez de leer
 * todos los inputs del DOM y reenviarlos enteros.
 */
export function UserStoryDetail({ story, projectId, useCaseId, onDeleted }: UserStoryDetailProps) {
  const confirm = useConfirm();
  const updateStory = useUpdateUserStory(projectId, useCaseId);
  const deleteStory = useDeleteUserStory(projectId, useCaseId);
  const { deleteInconsistency } = useStoryChildren(projectId, useCaseId);

  const { register, control, handleSubmit, reset, formState } = useForm<StoryFormValues>({
    defaultValues: storyToForm(story),
  });

  const { isDirty, dirtyFields } = formState;
  const recommendations = parseRecommendations(story.recommendations);

  const onSubmit = handleSubmit(async (values) => {
    const patch = buildStoryPatch(values, dirtyFields);

    if (Object.keys(patch).length === 0) {
      toast.info('No hay cambios para guardar');
      return;
    }

    try {
      await updateStory.mutateAsync({ id: story.id, patch });
      reset(values);
    } catch {
      // Toast manejado por el hook.
    }
  });

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Eliminar historia de usuario',
      description: `¿Eliminar ${story.key_id} — “${story.title}” y todos sus elementos relacionados? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar HU',
      destructive: true,
    });
    if (!ok) return;

    try {
      await deleteStory.mutateAsync(story.id);
      onDeleted();
    } catch {
      // Toast manejado por el hook.
    }
  };

  const handleResolveInconsistency = async (inconsistency: Inconsistency) => {
    const ok = await confirm({
      title: 'Resolver inconsistencia',
      description: `“${inconsistency.title}”\n\nSe eliminará definitivamente.`,
      confirmLabel: 'Resolver',
    });
    if (ok) deleteInconsistency.mutate(inconsistency.id);
  };

  return (
    <form className="flex h-full min-h-0 flex-col" onSubmit={onSubmit} noValidate>
      {/* Encabezado */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Badge tone="brand" className="font-mono">
            {story.key_id}
          </Badge>
          <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" />
          <h2 className="truncate text-sm font-semibold text-fg">{story.title}</h2>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/test-suites">
              <FlaskConical />
              Ver suites
              {story.test_count ? (
                <Badge tone="neutral" className="ml-1">
                  {story.test_count}
                </Badge>
              ) : null}
            </Link>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-fail"
            aria-label="Eliminar historia de usuario"
            onClick={handleDelete}
            loading={deleteStory.isPending}
          >
            <Trash2 />
          </Button>

          <div className="mx-1 h-5 w-px bg-border" aria-hidden />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!isDirty || updateStory.isPending}
            onClick={() => reset()}
          >
            <RotateCcw />
            Descartar
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!isDirty}
            loading={updateStory.isPending}
          >
            <Save />
            Guardar
          </Button>
        </div>
      </header>

      {/* Metadata */}
      <div className="grid shrink-0 grid-cols-[1fr_170px_130px] items-start gap-4 border-b border-border bg-surface px-4 py-3">
        <Field label="Título de la HU" htmlFor="story-title" error={formState.errors.title?.message}>
          <Input
            id="story-title"
            placeholder="Título de la historia…"
            aria-invalid={Boolean(formState.errors.title)}
            {...register('title', { required: 'El título es obligatorio' })}
          />
        </Field>

        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <Field label="Estado" htmlFor="story-status">
              <SelectField
                id="story-status"
                value={field.value}
                onValueChange={field.onChange}
                options={STATUS_OPTIONS}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="priority"
          render={({ field }) => (
            <Field label="Prioridad" htmlFor="story-priority">
              <SelectField
                id="story-priority"
                value={field.value}
                onValueChange={field.onChange}
                options={PRIORITY_OPTIONS}
              />
            </Field>
          )}
        />
      </div>

      <Tabs defaultValue="analisis" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="shrink-0">
          <TabsTrigger value="documentacion">Documentación</TabsTrigger>
          <TabsTrigger value="analisis">
            Análisis
            {(story.inconsistencies?.length ?? 0) > 0 ? (
              <Badge tone="warn" className="ml-1.5">
                {story.inconsistencies?.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="recomendaciones">Recomendaciones</TabsTrigger>
          <TabsTrigger value="escenarios">
            Escenarios
            {(story.scenarios?.length ?? 0) > 0 ? (
              <Badge tone="neutral" className="ml-1.5">
                {story.scenarios?.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="reglas">Reglas</TabsTrigger>
          <TabsTrigger value="precondiciones">Precondiciones</TabsTrigger>
        </TabsList>

        <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="documentacion">
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <DocumentationTab control={control} register={register} />
            </Suspense>
          </TabsContent>

          <TabsContent value="analisis">
            <InconsistenciesTab
              inconsistencies={story.inconsistencies ?? []}
              onResolve={handleResolveInconsistency}
              isResolving={deleteInconsistency.isPending}
            />
          </TabsContent>

          <TabsContent value="recomendaciones">
            <RecommendationsTab recommendations={recommendations} />
          </TabsContent>

          <TabsContent value="escenarios">
            <ScenariosTab story={story} projectId={projectId} useCaseId={useCaseId} />
          </TabsContent>

          <TabsContent value="reglas">
            <TextareaTab
              label="Reglas de negocio"
              name="reglas_negocio"
              placeholder="Reglas que rigen el comportamiento esperado…"
              register={register}
            />
          </TabsContent>

          <TabsContent value="precondiciones">
            <TextareaTab
              label="Precondiciones"
              name="precondiciones"
              placeholder="Estado o datos necesarios antes de ejecutar las pruebas…"
              register={register}
            />
          </TabsContent>
        </div>
      </Tabs>
    </form>
  );
}
