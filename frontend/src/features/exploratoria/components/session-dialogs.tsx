import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { SelectField } from '@/components/ui/select-field';
import { EvidencePanel } from '@/features/hallazgos/components/evidence-panel';
import { HALLZGO_SEVERITIES, type EvidenceItem, type ExploratoryHallazgo } from '@/lib/api/types';

/** Default: dentro de 7 días a las 18:00, en formato datetime-local. */
function defaultDeadlineInput() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T18:00`;
}

function nowInput() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function StartSessionDialog({
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending?: boolean;
  onSubmit: (values: {
    name: string;
    charter: string;
    timebox_minutes: number | null;
    planned_start_at: string;
    planned_end_at: string;
    deadline_at: string;
  }) => Promise<void>;
}) {
  const { control, register, handleSubmit, reset, getValues, formState } = useForm({
    defaultValues: {
      name: '',
      charter: '',
      timebox: '',
      start: nowInput(),
      end: defaultDeadlineInput(),
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: '',
      charter: '',
      timebox: '',
      start: nowInput(),
      end: defaultDeadlineInput(),
    });
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    const plannedEnd = new Date(values.end).toISOString();
    await onSubmit({
      name: values.name.trim(),
      charter: values.charter.trim(),
      timebox_minutes: values.timebox ? Number(values.timebox) : null,
      planned_start_at: new Date(values.start).toISOString(),
      planned_end_at: plannedEnd,
      deadline_at: plannedEnd,
    });
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <DialogTitle>Nueva sesión exploratoria</DialogTitle>
          <DialogDescription>
            Definí la ventana planificada (inicio y fin), el charter (misión) y, si querés, un timebox.
            El fin planificado es la fecha límite inicial de la sesión.
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} noValidate>
          <DialogBody className="space-y-4 px-6 py-4">
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="start"
              rules={{ required: 'El inicio planificado es obligatorio' }}
              render={({ field, fieldState }) => (
                <Field
                  label="Inicio planificado"
                  htmlFor="session-start"
                  error={fieldState.error?.message}
                >
                  <DatePicker
                    id="session-start"
                    withTime
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                </Field>
              )}
            />

            <Controller
              control={control}
              name="end"
              rules={{
                required: 'El fin planificado es obligatorio',
                validate: (value) =>
                  new Date(value).getTime() > new Date(getValues('start')).getTime() ||
                  'El fin debe ser posterior al inicio',
              }}
              render={({ field, fieldState }) => (
                <Field
                  label="Fin planificado"
                  htmlFor="session-end"
                  error={fieldState.error?.message}
                >
                  <DatePicker
                    id="session-end"
                    withTime
                    min={nowInput()}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                </Field>
              )}
            />
          </div>

          <Field label="Timebox (minutos)" htmlFor="session-timebox" hint="Opcional">
            <Input id="session-timebox" type="number" min={1} placeholder="Ej: 60" {...register('timebox')} />
          </Field>
          </DialogBody>

          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
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
  initial,
  userStories = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending?: boolean;
  onSubmit: (values: {
    title: string;
    steps: string;
    expected_result: string;
    us_id: number | null;
  }) => Promise<void>;
  /** Si viene un flujo, el diálogo edita en vez de crear. */
  initial?: {
    title: string;
    steps?: string | null;
    expected_result?: string | null;
    us_id?: number | null;
  } | null;
  /** HUs del proyecto para agrupar el flujo dentro de la sesión. */
  userStories?: Array<{ id: number; key_id: string; title: string; use_case_title?: string | null }>;
}) {
  const isEdit = Boolean(initial);
  const { control, register, handleSubmit, reset, formState } = useForm({
    defaultValues: { title: '', steps: '', expected: '', us_id: '' },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      title: initial?.title ?? '',
      steps: initial?.steps ?? '',
      expected: initial?.expected_result ?? '',
      us_id: initial?.us_id ? String(initial.us_id) : '',
    });
  }, [open, initial, reset]);

  const storyOptions = [
    { value: '', label: 'Sin HU (queda en “Sin vincular”)' },
    ...userStories.map((story) => ({
      value: String(story.id),
      label: `${story.key_id} · ${story.title}`,
      description: story.use_case_title ?? undefined,
    })),
  ];

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      title: values.title.trim(),
      steps: values.steps.trim(),
      expected_result: values.expected.trim(),
      us_id: values.us_id ? Number(values.us_id) : null,
    });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <DialogTitle>{isEdit ? 'Editar flujo' : 'Agregar flujo'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Actualizá el título, los pasos o el resultado esperado del flujo.'
              : 'Un flujo es un recorrido que vas a explorar dentro de la sesión.'}
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} noValidate>
          <DialogBody className="space-y-4 px-6 py-4">
          <Field label="Título" htmlFor="flow-title" error={formState.errors.title?.message}>
            <Input
              id="flow-title"
              autoFocus
              placeholder="Ej: Login con email vacío"
              {...register('title', { required: 'El título es obligatorio' })}
            />
          </Field>

          <Controller
            control={control}
            name="us_id"
            render={({ field }) => (
              <Field
                label="HU vinculada"
                htmlFor="flow-us"
                hint="Opcional. Si la elegís, el flujo se agrupa bajo esa HU dentro de la sesión."
              >
                <Combobox
                  id="flow-us"
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Sin HU"
                  searchPlaceholder="Buscar HU…"
                  aria-label="HU vinculada"
                  options={storyOptions}
                />
              </Field>
            )}
          />

          <Field label="Pasos" htmlFor="flow-steps">
            <Textarea id="flow-steps" className="min-h-20" placeholder="Pasos generales del flujo" {...register('steps')} />
          </Field>

          <Field label="Resultado esperado" htmlFor="flow-expected">
            <Textarea id="flow-expected" className="min-h-16" {...register('expected')} />
          </Field>
          </DialogBody>

          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              {isEdit ? 'Guardar cambios' : 'Agregar flujo'}
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
export interface HallazgoEvidenceDraft {
  file: File;
  category: string;
}

export function AddHallazgoDialog({
  open,
  onOpenChange,
  isPending,
  onSubmit,
  initial,
  evidence = [],
  isEvidenceLoading,
  isEvidenceUploading,
  onUploadEvidence,
  onDeleteEvidence,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending?: boolean;
  /** `files` solo viene en alta: se suben después de crear el hallazgo. */
  onSubmit: (values: HallazgoDraftInput, files?: HallazgoEvidenceDraft[]) => Promise<void>;
  /** Si viene un hallazgo, el diálogo edita en vez de crear. */
  initial?: ExploratoryHallazgo | null;
  /** Evidencias ya guardadas (solo edición). */
  evidence?: EvidenceItem[];
  isEvidenceLoading?: boolean;
  isEvidenceUploading?: boolean;
  onUploadEvidence?: (file: File, category: string) => void;
  onDeleteEvidence?: (item: EvidenceItem) => void;
}) {
  const isEdit = Boolean(initial);
  const [pending, setPending] = useState<File[]>([]);
  const [category, setCategory] = useState('BUG');
  const fileRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (!open) return;
    reset({
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      severity: initial?.severity || 'Media',
      steps: initial?.steps_to_reproduce ?? '',
      expected: initial?.expected_result ?? '',
      actual: initial?.actual_result ?? '',
    });
    setPending([]);
    setCategory('BUG');
  }, [open, initial, reset]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const images = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (images.length !== files.length) {
      toast.warning('Solo se permiten imágenes como evidencia');
    }
    if (images.length > 0) setPending((current) => [...current, ...images]);
  };

  const submit = handleSubmit(async (values) => {
    await onSubmit(
      {
        title: values.title.trim(),
        description: values.description.trim(),
        severity: values.severity,
        steps_to_reproduce: values.steps.trim(),
        expected_result: values.expected.trim(),
        actual_result: values.actual.trim(),
      },
      pending.map((file) => ({ file, category })),
    );
    setPending([]);
    onOpenChange(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          setPending([]);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
          <DialogTitle>{isEdit ? 'Editar hallazgo' : 'Agregar hallazgo'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Actualizá los datos del hallazgo y adjuntá evidencias. Los cambios se ven en todo el proyecto.'
              : 'Se guarda como hallazgo del proyecto, asociado a esta sesión exploratoria. Podés adjuntar capturas antes de crear el ticket en Jira.'}
          </DialogDescription>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} noValidate>
          <DialogBody className="space-y-4 px-6 py-4">
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
                className="min-h-20"
                placeholder="¿Qué pasó?"
                {...register('description')}
              />
            </Field>

            <Field label="Pasos para reproducir" htmlFor="hallazgo-steps">
              <Textarea id="hallazgo-steps" className="min-h-16" {...register('steps')} />
            </Field>

            <Field label="Resultado esperado" htmlFor="hallazgo-expected">
              <Textarea id="hallazgo-expected" className="min-h-16" {...register('expected')} />
            </Field>

            <Field label="Resultado obtenido" htmlFor="hallazgo-actual">
              <Textarea id="hallazgo-actual" className="min-h-16" {...register('actual')} />
            </Field>

            <div className="rounded-lg border border-border bg-surface-2 p-3">
              {isEdit ? (
                <EvidencePanel
                  items={evidence}
                  isLoading={isEvidenceLoading}
                  isUploading={isEvidenceUploading}
                  onUpload={(file, value) => onUploadEvidence?.(file, value)}
                  onDelete={(item) => onDeleteEvidence?.(item)}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
                      Evidencias ({pending.length})
                    </span>
                    <div className="w-36">
                      <SelectField
                        value={category}
                        onValueChange={setCategory}
                        options={[
                          { value: 'BUG', label: 'Error' },
                          { value: 'GENERAL', label: 'General' },
                          { value: 'FIGMA', label: 'Figma' },
                          { value: 'DEV', label: 'Sistema' },
                        ]}
                        aria-label="Categoría de la evidencia"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload />
                      Agregar captura
                    </Button>
                    <span className="text-caption text-fg-subtle">
                      Se suben al crear el hallazgo.
                    </span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        addFiles(event.target.files);
                        event.target.value = '';
                      }}
                    />
                  </div>

                  {pending.length === 0 ? (
                    <p className="py-1 text-caption text-fg-subtle">Sin evidencias adjuntas.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {pending.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="group relative w-24 overflow-hidden rounded-lg border border-dashed border-brand"
                        >
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="h-16 w-full object-cover opacity-80"
                          />
                          <span className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                            PENDIENTE
                          </span>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon-sm"
                            className="absolute right-1 top-1 size-6 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-label={`Quitar ${file.name}`}
                            onClick={() =>
                              setPending((current) => current.filter((_, i) => i !== index))
                            }
                          >
                            <X />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </DialogBody>

          <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              {isEdit ? 'Guardar cambios' : 'Crear hallazgo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
