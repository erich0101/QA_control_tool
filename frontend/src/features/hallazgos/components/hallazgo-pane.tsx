import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Bug, ExternalLink, RotateCcw, Save, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { SelectField } from '@/components/ui/select-field';
import { HALLZGO_STATUSES, type Hallazgo, type TestSuite, type User } from '@/lib/api/types';
import { useEvidence, useEvidenceMutations, useHallazgoMutations } from '../use-hallazgos';
import {
  buildHallazgoPatch,
  buildHallazgoPayload,
  hallazgoToForm,
  type HallazgoFormValues,
} from '../lib/forms';
import { SeverityBadge } from './badges';
import { EvidencePanel } from './evidence-panel';
import { HallazgoFields } from './hallazgo-fields';
import { ConvertToTcDialog } from './convert-to-tc-dialog';

interface HallazgoPaneProps {
  hallazgo?: Hallazgo | null;
  projectId: number | null;
  team: User[];
  suites: TestSuite[];
  onCreated: (id: number) => void;
  onDeleted: () => void;
  onCancel: () => void;
}

const STATUS_OPTIONS = HALLZGO_STATUSES.map((value) => ({ value, label: value }));

export function HallazgoPane({
  hallazgo,
  projectId,
  team,
  suites,
  onCreated,
  onDeleted,
  onCancel,
}: HallazgoPaneProps) {
  const isEdit = Boolean(hallazgo);
  const confirm = useConfirm();
  const mutations = useHallazgoMutations(projectId);
  const { data: evidence = [], isLoading: evidenceLoading } = useEvidence(
    'defect',
    hallazgo?.id ?? null,
  );
  const evidenceMutations = useEvidenceMutations(projectId, 'defect', hallazgo?.id ?? null);
  const [convertOpen, setConvertOpen] = useState(false);

  const form = useForm<HallazgoFormValues>({ defaultValues: hallazgoToForm(hallazgo) });
  const { isDirty, dirtyFields } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    if (isEdit && hallazgo) {
      const patch = buildHallazgoPatch(values, dirtyFields);
      if (Object.keys(patch).length === 0) {
        toast.info('No hay cambios para guardar');
        return;
      }
      await mutations.update.mutateAsync({ id: hallazgo.id, patch });
      form.reset(values);
      return;
    }

    const result = await mutations.create.mutateAsync(buildHallazgoPayload(values));
    form.reset(hallazgoToForm(null));
    onCreated(result.id);
  });

  const handleDelete = async () => {
    if (!hallazgo) return;
    const ok = await confirm({
      title: 'Eliminar hallazgo',
      description: `¿Eliminar “${hallazgo.title}”? Se eliminan también sus evidencias.`,
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;

    await mutations.remove.mutateAsync(hallazgo.id);
    onDeleted();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-surface px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
                {isEdit ? `Hallazgo #${hallazgo?.id}` : 'Nuevo hallazgo'}
              </span>
              {hallazgo ? <SeverityBadge severity={hallazgo.severity} /> : null}
              {hallazgo?.converted_to_tc ? (
                <span className="text-caption text-ok">TC #{hallazgo.converted_tc_id}</span>
              ) : null}
              {hallazgo?.converted_to_bug ? (
                <span className="text-caption text-warn">BUG #{hallazgo.converted_bug_id}</span>
              ) : null}
            </div>
            {hallazgo?.created_at ? (
              <p className="text-caption text-fg-subtle">
                Reportado {new Date(hallazgo.created_at).toLocaleString('es-AR')} ·{' '}
                {hallazgo.reporter_name ?? 'Desconocido'}
              </p>
            ) : null}
          </div>

          {isEdit && hallazgo ? (
            <>
              <div className="w-36">
                <SelectField
                  value={hallazgo.status ?? 'OPEN'}
                  onValueChange={(status) =>
                    mutations.setStatus.mutate({ id: hallazgo.id, status })
                  }
                  options={STATUS_OPTIONS}
                  aria-label="Estado del hallazgo"
                />
              </div>

              {hallazgo.jira_key ? (
                <Button variant="ghost" size="sm" asChild className="text-brand">
                  <a href={hallazgo.jira_url ?? '#'} target="_blank" rel="noopener noreferrer">
                    {hallazgo.jira_key}
                    <ExternalLink />
                  </a>
                </Button>
              ) : null}

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConvertOpen(true)}
                disabled={Boolean(hallazgo.converted_to_tc) || suites.length === 0}
                title={
                  hallazgo.converted_to_tc
                    ? 'Ya convertido a test case'
                    : 'Crear un test case a partir de este hallazgo'
                }
              >
                <Wand2 />
                Convertir a TC
              </Button>

              <Button
                variant="ghost"
                size="icon-sm"
                className="text-fail"
                aria-label="Eliminar hallazgo"
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
                onClick={() => form.reset(hallazgoToForm(hallazgo))}
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
            {isEdit ? <Save /> : <Bug />}
            {isEdit ? 'Guardar' : 'Crear hallazgo'}
          </Button>
        </div>
      </header>

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-5">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} noValidate className="mx-auto max-w-4xl space-y-6">
            <HallazgoFields team={team} />

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

      {hallazgo ? (
        <ConvertToTcDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          suites={suites}
          isPending={mutations.convertToTestCase.isPending}
          onConvert={async (suiteId) => {
            await mutations.convertToTestCase.mutateAsync({ id: hallazgo.id, suiteId });
            setConvertOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
