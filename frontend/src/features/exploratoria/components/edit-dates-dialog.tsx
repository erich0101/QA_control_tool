import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { CalendarClock } from 'lucide-react';
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

const pad = (value: number) => String(value).padStart(2, '0');

function toInput(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface EditDatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: {
    planned_start_at?: string | null;
    planned_end_at?: string | null;
    deadline_at?: string | null;
  };
  isPending?: boolean;
  onSubmit: (values: {
    plannedStartAt: string;
    plannedEndAt: string;
    deadlineAt: string;
    reason: string;
  }) => Promise<void>;
}

/**
 * Reprogramación de la sesión: permite ajustar inicio y fin planificados y la
 * fecha límite vigente. Cada fecha modificada queda en el histórico con su
 * justificación, autor y fecha de registro.
 */
export function EditDatesDialog({
  open,
  onOpenChange,
  current,
  isPending,
  onSubmit,
}: EditDatesDialogProps) {
  const { register, handleSubmit, reset, getValues, formState } = useForm({
    defaultValues: {
      start: toInput(current.planned_start_at),
      end: toInput(current.planned_end_at),
      deadline: toInput(current.deadline_at),
      reason: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      start: toInput(current.planned_start_at),
      end: toInput(current.planned_end_at),
      deadline: toInput(current.deadline_at),
      reason: '',
    });
  }, [open, current.planned_start_at, current.planned_end_at, current.deadline_at, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      plannedStartAt: new Date(values.start).toISOString(),
      plannedEndAt: new Date(values.end).toISOString(),
      deadlineAt: new Date(values.deadline).toISOString(),
      reason: values.reason.trim(),
    });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cambiar fechas de la sesión</DialogTitle>
          <DialogDescription>
            Ajustá la ventana planificada y/o la fecha límite vigente. Cada fecha que cambie queda
            registrada con su justificación, autor y fecha.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit} noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Inicio planificado"
              htmlFor="edit-dates-start"
              error={formState.errors.start?.message}
            >
              <Input
                id="edit-dates-start"
                type="datetime-local"
                {...register('start', { required: 'El inicio planificado es obligatorio' })}
              />
            </Field>

            <Field
              label="Fin planificado"
              htmlFor="edit-dates-end"
              error={formState.errors.end?.message}
            >
              <Input
                id="edit-dates-end"
                type="datetime-local"
                {...register('end', {
                  required: 'El fin planificado es obligatorio',
                  validate: (value) =>
                    new Date(value).getTime() > new Date(getValues('start')).getTime() ||
                    'El fin debe ser posterior al inicio',
                  deps: 'start',
                })}
              />
            </Field>
          </div>

          <Field
            label="Fecha límite vigente"
            htmlFor="edit-dates-deadline"
            error={formState.errors.deadline?.message}
            hint="Es el límite que se usa para las alertas y la postergación."
          >
            <Input
              id="edit-dates-deadline"
              type="datetime-local"
              {...register('deadline', {
                required: 'La fecha límite es obligatoria',
                validate: (value) =>
                  new Date(value).getTime() > Date.now() || 'La fecha límite debe ser futura',
              })}
            />
          </Field>

          <Field
            label="Justificación del cambio"
            htmlFor="edit-dates-reason"
            error={formState.errors.reason?.message}
            hint="Obligatoria. Se guarda junto a cada fecha modificada."
          >
            <Textarea
              id="edit-dates-reason"
              className="min-h-20"
              placeholder="Ej: se reprograma el inicio por indisponibilidad del ambiente"
              {...register('reason', {
                required: 'La justificación es obligatoria',
                minLength: { value: 5, message: 'Mínimo 5 caracteres' },
              })}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              <CalendarClock />
              Guardar fechas
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
