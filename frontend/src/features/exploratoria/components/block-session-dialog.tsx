import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Ban } from 'lucide-react';
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
import { Textarea } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';

const pad = (value: number) => String(value).padStart(2, '0');

function nowInput() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface BlockSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending?: boolean;
  onSubmit: (values: { reason: string; blockedFrom: string }) => Promise<void>;
}

/**
 * Registra un bloqueo de testing por fuerza mayor. El bloqueo no modifica las
 * fechas de la sesión: solo deja constancia del período y el motivo.
 */
export function BlockSessionDialog({
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: BlockSessionDialogProps) {
  const { control, register, handleSubmit, reset, formState } = useForm({
    defaultValues: { reason: '', from: nowInput() },
  });

  useEffect(() => {
    if (!open) return;
    reset({ reason: '', from: nowInput() });
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      reason: values.reason.trim(),
      blockedFrom: new Date(values.from).toISOString(),
    });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bloquear testing por fuerza mayor</DialogTitle>
          <DialogDescription>
            Queda registrado el período bloqueado y su motivo. Las fechas planificadas y la fecha
            límite no se modifican automáticamente.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit} noValidate>
          <Controller
            control={control}
            name="from"
            rules={{ required: 'La fecha de inicio es obligatoria' }}
            render={({ field, fieldState }) => (
              <Field
                label="Inicio del bloqueo"
                htmlFor="block-from"
                error={fieldState.error?.message}
              >
                <DatePicker
                  id="block-from"
                  withTime
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              </Field>
            )}
          />

          <Field
            label="Motivo (fuerza mayor)"
            htmlFor="block-reason"
            error={formState.errors.reason?.message}
            hint="Obligatorio. Se muestra en el historial y en los reportes."
          >
            <Textarea
              id="block-reason"
              className="min-h-20"
              placeholder="Ej: ambiente caído por incidente del proveedor"
              {...register('reason', {
                required: 'El motivo es obligatorio',
                minLength: { value: 5, message: 'Mínimo 5 caracteres' },
              })}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              <Ban />
              Registrar bloqueo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
