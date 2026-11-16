import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Pencil } from 'lucide-react';
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
import { Input } from '@/components/ui/input';

interface RenameSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  isPending?: boolean;
  onSubmit: (values: { name: string }) => Promise<void>;
}

/** Edición del nombre de una sesión exploratoria existente. */
export function RenameSessionDialog({
  open,
  onOpenChange,
  currentName,
  isPending,
  onSubmit,
}: RenameSessionDialogProps) {
  const { register, handleSubmit, reset, formState } = useForm({
    defaultValues: { name: currentName },
  });

  useEffect(() => {
    if (!open) return;
    reset({ name: currentName });
  }, [open, currentName, reset]);

  const submit = handleSubmit(async (values) => {
    await onSubmit({ name: values.name.trim() });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar nombre de la sesión</DialogTitle>
          <DialogDescription>
            Corregí el nombre con el que se identifica la sesión en el listado y en los reportes.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field
            label="Nombre de la sesión"
            htmlFor="rename-session-name"
            error={formState.errors.name?.message}
          >
            <Input
              id="rename-session-name"
              autoFocus
              maxLength={200}
              placeholder="Ej: Smoke checkout"
              {...register('name', {
                required: 'El nombre es obligatorio',
                maxLength: { value: 200, message: 'Máximo 200 caracteres' },
                validate: (value) =>
                  value.trim().length > 0 || 'El nombre es obligatorio',
              })}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              <Pencil />
              Guardar nombre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
