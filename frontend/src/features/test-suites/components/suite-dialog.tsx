import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { useEffect } from 'react';
import type { TestSuite, UseCase } from '@/lib/api/types';
import { useSuiteMutations } from '../use-test-suites';

interface SuiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
  useCases: UseCase[];
  /** CU preseleccionado (filtro activo). */
  defaultUseCaseId?: number | null;
  suite?: TestSuite | null;
  epics: Array<{ key: string; name: string }>;
  onCreated?: (id: number) => void;
}

interface FormValues {
  use_case_id: string;
  title: string;
  description: string;
  jira_epic_key: string;
}

export function SuiteDialog({
  open,
  onOpenChange,
  projectId,
  useCases,
  defaultUseCaseId,
  suite,
  epics,
  onCreated,
}: SuiteDialogProps) {
  const isEdit = Boolean(suite);
  const { create, update } = useSuiteMutations(projectId);
  const isPending = create.isPending || update.isPending;

  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: { use_case_id: '', title: '', description: '', jira_epic_key: '' },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      use_case_id: suite?.use_case_id
        ? String(suite.use_case_id)
        : defaultUseCaseId
          ? String(defaultUseCaseId)
          : '',
      title: suite?.title ?? '',
      description: (suite?.description as string | undefined) ?? '',
      jira_epic_key: suite?.jira_epic_key ?? '',
    });
  }, [open, suite, defaultUseCaseId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit && suite) {
        await update.mutateAsync({
          id: suite.id,
          input: {
            title: values.title.trim(),
            description: values.description.trim(),
            jira_epic_key: values.jira_epic_key,
          },
        });
      } else {
        const result = await create.mutateAsync({
          use_case_id: Number(values.use_case_id),
          title: values.title.trim(),
          description: values.description.trim(),
          jira_epic_key: values.jira_epic_key,
        });
        onCreated?.(result.id);
      }
      onOpenChange(false);
    } catch {
      // Toast manejado por el hook.
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar test suite' : 'Nueva test suite'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Actualizá los datos de la suite. Los tests no se modifican.'
              : 'Agrupa los test cases de un caso de uso.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <Field label="Caso de uso" htmlFor="suite-cu" error={formState.errors.use_case_id?.message}>
            <Controller
              control={control}
              name="use_case_id"
              rules={{ required: 'Elegí un caso de uso' }}
              render={({ field }) => (
                <SelectField
                  id="suite-cu"
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isEdit}
                  placeholder="Seleccioná un caso de uso"
                  options={useCases.map((item) => ({
                    value: String(item.id),
                    label: `${item.key_id} · ${item.title}`,
                  }))}
                />
              )}
            />
          </Field>

          <Field label="Título" htmlFor="suite-title" error={formState.errors.title?.message}>
            <Input
              id="suite-title"
              autoFocus
              placeholder="Ej: Validaciones de login"
              aria-invalid={Boolean(formState.errors.title)}
              {...register('title', { required: 'El título es obligatorio' })}
            />
          </Field>

          <Field label="Épica de Jira" htmlFor="suite-epic" hint={epics.length === 0 ? 'Sin épicas disponibles (configurá el token de Jira).' : undefined}>
            <Controller
              control={control}
              name="jira_epic_key"
              render={({ field }) => (
                <SelectField
                  id="suite-epic"
                  value={field.value}
                  onValueChange={field.onChange}
                  allowEmpty
                  placeholder="Sin épica"
                  options={epics.map((epic) => ({
                    value: epic.key,
                    label: `${epic.key} · ${epic.name}`,
                  }))}
                />
              )}
            />
          </Field>

          <Field label="Descripción" htmlFor="suite-description">
            <Textarea id="suite-description" placeholder="Descripción (opcional)" {...register('description')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              {isEdit ? 'Guardar cambios' : 'Crear suite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
