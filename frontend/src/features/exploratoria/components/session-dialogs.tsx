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

export function StartSessionDialog({
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending?: boolean;
  onSubmit: (values: { name: string; charter: string; timebox_minutes: number | null }) => Promise<void>;
}) {
  const { register, handleSubmit, reset, formState } = useForm({
    defaultValues: { name: '', charter: '', timebox: '' },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      name: values.name.trim(),
      charter: values.charter.trim(),
      timebox_minutes: values.timebox ? Number(values.timebox) : null,
    });
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva sesión exploratoria</DialogTitle>
          <DialogDescription>
            Definí el charter (misión) y, si querés, un timebox.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field label="Nombre" htmlFor="session-name" error={formState.errors.name?.message}>
            <Input
              id="session-name"
              autoFocus
              placeholder="Ej: Smoke checkout"
              {...register('name', { required: 'El nombre es obligatorio' })}
            />
          </Field>

          <Field label="Charter / misión" htmlFor="session-charter">
            <Textarea
              id="session-charter"
              className="min-h-20"
              placeholder="¿Qué vas a explorar y qué buscás?"
              {...register('charter')}
            />
          </Field>

          <Field label="Timebox (minutos)" htmlFor="session-timebox" hint="Opcional">
            <Input id="session-timebox" type="number" min={1} placeholder="Ej: 60" {...register('timebox')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              Iniciar sesión
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddFlowDialog({
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending?: boolean;
  onSubmit: (values: { title: string; steps: string; expected_result: string }) => Promise<void>;
}) {
  const { register, handleSubmit, reset, formState } = useForm({
    defaultValues: { title: '', steps: '', expected: '' },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      title: values.title.trim(),
      steps: values.steps.trim(),
      expected_result: values.expected.trim(),
    });
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar flujo</DialogTitle>
          <DialogDescription>
            Un flujo es un recorrido que vas a explorar dentro de la sesión.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field label="Título" htmlFor="flow-title" error={formState.errors.title?.message}>
            <Input
              id="flow-title"
              autoFocus
              placeholder="Ej: Login con email vacío"
              {...register('title', { required: 'El título es obligatorio' })}
            />
          </Field>

          <Field label="Pasos" htmlFor="flow-steps">
            <Textarea id="flow-steps" className="min-h-20" placeholder="Pasos generales del flujo" {...register('steps')} />
          </Field>

          <Field label="Resultado esperado" htmlFor="flow-expected">
            <Textarea id="flow-expected" className="min-h-16" {...register('expected')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              Agregar flujo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
