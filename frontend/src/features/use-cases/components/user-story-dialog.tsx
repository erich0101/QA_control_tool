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
import { STORY_PRIORITIES, STORY_STATUSES } from '@/lib/api/types';
import { useCreateUserStory } from '../use-use-cases';

interface UserStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
  useCaseId: number | null;
  onCreated?: (id: number) => void;
}

interface FormValues {
  key_id: string;
  title: string;
  status: string;
  priority: string;
  hu_detallada: string;
}

const STATUS_OPTIONS = STORY_STATUSES.map((value) => ({ value, label: value }));
const PRIORITY_OPTIONS = STORY_PRIORITIES.map((value) => ({ value, label: value }));

export function UserStoryDialog({
  open,
  onOpenChange,
  projectId,
  useCaseId,
  onCreated,
}: UserStoryDialogProps) {
  const createStory = useCreateUserStory(projectId, useCaseId);

  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: {
      key_id: '',
      title: '',
      status: 'En Análisis',
      priority: 'Media',
      hu_detallada: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!useCaseId) return;
    try {
      const result = await createStory.mutateAsync({
        use_case_id: useCaseId,
        key_id: values.key_id.trim() || undefined,
        title: values.title.trim(),
        status: values.status,
        priority: values.priority,
        // El backend convierte esto en la primera inconsistencia de la HU.
        hu_detallada: values.hu_detallada.trim(),
      });
      reset();
      onOpenChange(false);
      onCreated?.(result.id);
    } catch {
      // Toast manejado por el hook.
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nueva historia de usuario</DialogTitle>
          <DialogDescription>
            Se agrega al caso de uso seleccionado. El análisis inicial queda como primera
            inconsistencia.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Key ID" htmlFor="us-key" hint="Auto si se deja vacío">
              <Input id="us-key" placeholder="US-101" {...register('key_id')} />
            </Field>

            <Field label="Título" htmlFor="us-title" error={formState.errors.title?.message}>
              <Input
                id="us-title"
                autoFocus
                placeholder="Ej: Login con Google SSO"
                aria-invalid={Boolean(formState.errors.title)}
                {...register('title', { required: 'El título es obligatorio' })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Field label="Estado" htmlFor="us-status">
                  <SelectField
                    id="us-status"
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
                <Field label="Prioridad" htmlFor="us-priority">
                  <SelectField
                    id="us-priority"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={PRIORITY_OPTIONS}
                  />
                </Field>
              )}
            />
          </div>

          <Field
            label="Análisis de inconsistencias"
            htmlFor="us-detail"
            hint="Como [rol], quiero [acción], para [valor]…"
          >
            <Textarea id="us-detail" className="min-h-24" {...register('hu_detallada')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={createStory.isPending}>
              Crear HU
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
