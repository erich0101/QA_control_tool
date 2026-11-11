import { FormProvider, useForm } from 'react-hook-form';
import { Lightbulb, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { SelectField } from '@/components/ui/select-field';
import { SUGGESTION_STATUSES, type Suggestion, type User } from '@/lib/api/types';
import { useEvidence, useEvidenceMutations, useSuggestionMutations } from '../use-hallazgos';
import {
  buildSuggestionPatch,
  buildSuggestionPayload,
  suggestionToForm,
  type SuggestionFormValues,
} from '../lib/forms';
import { CategoryBadge } from './badges';
import { EvidencePanel } from './evidence-panel';
import { SuggestionFields } from './suggestion-fields';

interface SuggestionPaneProps {
  suggestion?: Suggestion | null;
  projectId: number | null;
  team: User[];
  onCreated: (id: number) => void;
  onDeleted: () => void;
  onCancel: () => void;
}

const STATUS_OPTIONS = SUGGESTION_STATUSES.map((value) => ({ value, label: value }));

export function SuggestionPane({
  suggestion,
  projectId,
  team,
  onCreated,
  onDeleted,
  onCancel,
}: SuggestionPaneProps) {
  const isEdit = Boolean(suggestion);
  const confirm = useConfirm();
  const mutations = useSuggestionMutations(projectId);
  const { data: evidence = [], isLoading: evidenceLoading } = useEvidence(
    'suggestion',
    suggestion?.id ?? null,
  );
  const evidenceMutations = useEvidenceMutations(
    projectId,
    'suggestion',
    suggestion?.id ?? null,
  );

  const form = useForm<SuggestionFormValues>({ defaultValues: suggestionToForm(suggestion) });
  const { isDirty, dirtyFields } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    if (isEdit && suggestion) {
      const patch = buildSuggestionPatch(values, dirtyFields);
      if (Object.keys(patch).length === 0) {
        toast.info('No hay cambios para guardar');
        return;
      }
      await mutations.update.mutateAsync({ id: suggestion.id, patch });
      form.reset(values);
      return;
    }

    const result = await mutations.create.mutateAsync(buildSuggestionPayload(values));
    form.reset(suggestionToForm(null));
    onCreated(result.id);
  });

  const handleDelete = async () => {
    if (!suggestion) return;
    const ok = await confirm({
      title: 'Eliminar sugerencia',
      description: `¿Eliminar “${suggestion.title}”?`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;

    await mutations.remove.mutateAsync(suggestion.id);
    onDeleted();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-5 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
              {isEdit ? `Sugerencia #${suggestion?.id}` : 'Nueva sugerencia'}
            </span>
            {suggestion ? <CategoryBadge category={suggestion.category} /> : null}
          </div>
          {suggestion?.created_at ? (
            <p className="text-caption text-fg-subtle">
              Creada {new Date(suggestion.created_at).toLocaleString('es-AR')} ·{' '}
              {suggestion.creator_name ?? 'Desconocido'}
            </p>
          ) : null}
        </div>

        {isEdit && suggestion ? (
          <>
            <div className="w-36">
              <SelectField
                value={suggestion.status ?? 'OPEN'}
                onValueChange={(status) =>
                  mutations.setStatus.mutate({ id: suggestion.id, status })
                }
                options={STATUS_OPTIONS}
                aria-label="Estado de la sugerencia"
              />
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              className="text-fail"
              aria-label="Eliminar sugerencia"
              onClick={handleDelete}
              disabled={mutations.remove.isPending}
            >
              <Trash2 />
            </Button>

            <div className="mx-1 h-5 w-px bg-border" aria-hidden />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!isDirty}
              onClick={() => form.reset(suggestionToForm(suggestion))}
            >
              <RotateCcw />
              Descartar
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSubmit}
          loading={mutations.create.isPending || mutations.update.isPending}
          disabled={isEdit && !isDirty}
        >
          {isEdit ? <Save /> : <Lightbulb />}
          {isEdit ? 'Guardar' : 'Crear sugerencia'}
        </Button>
      </header>

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-5">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl space-y-6">
            <SuggestionFields team={team} />

            {isEdit ? (
              <div className="rounded-xl border border-border bg-surface p-4">
                <EvidencePanel
                  items={evidence}
                  isLoading={evidenceLoading}
                  isUploading={evidenceMutations.upload.isPending}
                  onUpload={(file, category) => evidenceMutations.upload.mutate({ file, category })}
                  onDelete={(item) => evidenceMutations.removeEvidence.mutate(item.id)}
                />
              </div>
            ) : null}
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
