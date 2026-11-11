import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import type { UseCase } from '@/lib/api/types';
import { useCreateUseCase, useUpdateUseCase } from '../use-use-cases';

interface UseCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
  /** Si viene, edita; si no, crea. */
  useCase?: UseCase | null;
  onCreated?: (id: number) => void;
}

interface FormValues {
  key_id: string;
  title: string;
  description: string;
}

export function UseCaseDialog({
  open,
  onOpenChange,
  projectId,
  useCase,
  onCreated,
}: UseCaseDialogProps) {
  const isEdit = Boolean(useCase);
  const createUseCase = useCreateUseCase(projectId);
  const updateUseCase = useUpdateUseCase(projectId);
  const isPending = createUseCase.isPending || updateUseCase.isPending;

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: { key_id: '', title: '', description: '' },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      key_id: useCase?.key_id ?? '',
      title: useCase?.title ?? '',
      description: useCase?.description ?? '',
    });
  }, [open, useCase, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit && useCase) {
        await updateUseCase.mutateAsync({
          id: useCase.id,
          input: {
            title: values.title.trim(),
            description: values.description.trim(),
          },
        });
      } else {
        const result = await createUseCase.mutateAsync({
          key_id: values.key_id.trim() || undefined,
          title: values.title.trim(),
          description: values.description.trim(),
        });
        onCreated?.(result.id);
      }
      onOpenChange(false);
    } catch {
      // Los hooks muestran el toast de error.
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar caso de uso' : 'Nuevo caso de uso'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Actualizá el título o la descripción del caso de uso.'
              : 'Los casos de uso agrupan historias de usuario y sus test suites.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="grid grid-cols-[160px_1fr] gap-3">
            <Field label="Key ID" htmlFor="cu-key" hint="Auto si se deja vacío">
              <Input
                id="cu-key"
                placeholder="CU-001"
                disabled={isEdit}
                {...register('key_id')}
              />
            </Field>

            <Field
              label="Título"
              htmlFor="cu-title"
              error={formState.errors.title?.message}
            >
              <Input
                id="cu-title"
                autoFocus
                placeholder="Ej: Gestión de usuarios"
                aria-invalid={Boolean(formState.errors.title)}
                {...register('title', { required: 'El título es obligatorio' })}
              />
            </Field>
          </div>

          <Field label="Descripción" htmlFor="cu-description">
            <Textarea
              id="cu-description"
              placeholder="Descripción del caso de uso (opcional)"
              {...register('description')}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              {isEdit ? 'Guardar cambios' : 'Crear caso de uso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
