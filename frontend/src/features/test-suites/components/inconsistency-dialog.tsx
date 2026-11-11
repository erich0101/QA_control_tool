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
import { INCONSISTENCY_SEVERITIES } from '@/lib/api/types';

interface InconsistencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suiteTitle: string;
  isPending?: boolean;
  onSubmit: (values: { title: string; description: string; severity: string }) => Promise<void>;
}

interface FormValues {
  title: string;
  description: string;
  severity: string;
}

const SEVERITY_OPTIONS = INCONSISTENCY_SEVERITIES.map((value) => ({ value, label: value }));

export function InconsistencyDialog({
  open,
  onOpenChange,
  suiteTitle,
  isPending,
  onSubmit,
}: InconsistencyDialogProps) {
  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: { title: '', description: '', severity: 'Alta' },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      title: values.title.trim(),
      description: values.description.trim(),
      severity: values.severity,
    });
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar inconsistencia</DialogTitle>
          <DialogDescription>
            Queda asociada a la suite <span className="font-medium text-fg">{suiteTitle}</span>.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field label="Título" htmlFor="inc-title" error={formState.errors.title?.message}>
            <Input
              id="inc-title"
              autoFocus
              placeholder="Ej: No se valida el email duplicado"
              {...register('title', { required: 'El título es obligatorio' })}
            />
          </Field>

          <Controller
            control={control}
            name="severity"
            render={({ field }) => (
              <Field label="Severidad" htmlFor="inc-severity">
                <SelectField
                  id="inc-severity"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={SEVERITY_OPTIONS}
                />
              </Field>
            )}
          />

          <Field label="Descripción" htmlFor="inc-description">
            <Textarea id="inc-description" placeholder="Detalle (opcional)" {...register('description')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              Agregar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
