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

interface ExtendDeadlineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDeadline?: string | null;
  isPending?: boolean;
  onSubmit: (values: { deadlineAt: string; reason: string }) => Promise<void>;
}

const pad = (value: number) => String(value).padStart(2, '0');

function toInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextDeadline(current?: string | null) {
  const base = current ? new Date(current) : new Date();
  if (Number.isNaN(base.getTime())) return toInput(new Date(Date.now() + 7 * 86_400_000));
  base.setDate(base.getDate() + 7);
  base.setHours(18, 0, 0, 0);
  return toInput(base);
}

export function ExtendDeadlineDialog({
  open,
  onOpenChange,
  currentDeadline,
  isPending,
  onSubmit,
}: ExtendDeadlineDialogProps) {
  const { register, handleSubmit, reset, formState } = useForm({
    defaultValues: { deadline: nextDeadline(currentDeadline), reason: '' },
  });

  useEffect(() => {
    if (!open) return;
    reset({ deadline: nextDeadline(currentDeadline), reason: '' });
  }, [open, currentDeadline, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      deadlineAt: new Date(values.deadline).toISOString(),
      reason: values.reason.trim(),
    });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Extender fecha límite</DialogTitle>
          <DialogDescription>
            La sesión se está por vencer o ya venció. Elegí la nueva fecha y justificá la demora:
            queda registrado en el historial de la sesión.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-caption text-warn">
          <CalendarClock className="mr-1 inline size-3.5" />
          Fecha límite actual:{' '}
          <strong>
            {currentDeadline
              ? new Date(currentDeadline).toLocaleString('es-AR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })
              : 'sin definir'}
          </strong>
        </div>

        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field
            label="Nueva fecha límite"
            htmlFor="extend-deadline"
            error={formState.errors.deadline?.message}
          >
            <Input
              id="extend-deadline"
              type="datetime-local"
              {...register('deadline', {
                required: 'La nueva fecha es obligatoria',
                validate: (value) => {
                  const date = new Date(value);
                  if (Number.isNaN(date.getTime())) return 'Fecha inválida';
                  if (date.getTime() <= Date.now()) return 'Debe ser futura';
                  if (currentDeadline && date.getTime() <= new Date(currentDeadline).getTime()) {
                    return 'Debe ser posterior a la fecha actual';
                  }
                  return true;
                },
              })}
            />
          </Field>

          <Field
            label="Justificación de la demora"
            htmlFor="extend-reason"
            error={formState.errors.reason?.message}
            hint="Obligatoria. Queda asociada a la extensión."
          >
            <Textarea
              id="extend-reason"
              className="min-h-20"
              placeholder="Ej: el ambiente estuvo caído y faltan validar 8 flujos"
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
              Extender fecha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
