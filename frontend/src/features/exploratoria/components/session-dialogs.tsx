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
import { SelectField } from '@/components/ui/select-field';
import { HALLZGO_SEVERITIES } from '@/lib/api/types';

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

export interface HallazgoDraftInput {
  title: string;
  description: string;
  severity: string;
  steps_to_reproduce: string;
  expected_result: string;
  actual_result: string;
}

/**
 * Hallazgo creado dentro de una sesión exploratoria. Reutiliza los endpoints
 * de hallazgos: se guarda en qa_defects (sin ejecución) vinculado al run y
 * aparece en Hallazgos como cualquier otro.
 */
export function AddHallazgoDialog({
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending?: boolean;
  onSubmit: (values: HallazgoDraftInput) => Promise<void>;
}) {
  const { register, handleSubmit, reset, setValue, watch, formState } = useForm<{
    title: string;
    description: string;
    severity: string;
    steps: string;
    expected: string;
    actual: string;
  }>({
    defaultValues: {
      title: '',
      description: '',
      severity: 'Media',
      steps: '',
      expected: '',
      actual: '',
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      title: values.title.trim(),
      description: values.description.trim(),
      severity: values.severity,
      steps_to_reproduce: values.steps.trim(),
      expected_result: values.expected.trim(),
      actual_result: values.actual.trim(),
    });
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar hallazgo</DialogTitle>
          <DialogDescription>
            Se guarda como hallazgo del proyecto, asociado a esta sesión exploratoria.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field label="Título" htmlFor="hallazgo-title" error={formState.errors.title?.message}>
            <Input
              id="hallazgo-title"
              autoFocus
              placeholder="Ej: El botón Guardar no responde con campos vacíos"
              {...register('title', { required: 'El título es obligatorio' })}
            />
          </Field>

          <Field label="Severidad" htmlFor="hallazgo-severity">
            <SelectField
              id="hallazgo-severity"
              value={watch('severity')}
              onValueChange={(value) => setValue('severity', value)}
              options={HALLZGO_SEVERITIES.map((value) => ({ value, label: value }))}
            />
          </Field>

          <Field label="Descripción" htmlFor="hallazgo-description">
            <Textarea
              id="hallazgo-description"
              placeholder="¿Qué pasó?"
              {...register('description')}
            />
          </Field>

          <Field label="Pasos para reproducir" htmlFor="hallazgo-steps">
            <Textarea id="hallazgo-steps" className="min-h-16" {...register('steps')} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Resultado esperado" htmlFor="hallazgo-expected">
              <Textarea id="hallazgo-expected" className="min-h-16" {...register('expected')} />
            </Field>
            <Field label="Resultado obtenido" htmlFor="hallazgo-actual">
              <Textarea id="hallazgo-actual" className="min-h-16" {...register('actual')} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              Crear hallazgo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
