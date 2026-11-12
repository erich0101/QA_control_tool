import { useEffect, useRef, useState } from 'react';
import { Bug, CircleCheck, CircleSlash, CircleX, Save, SkipForward, TriangleAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-provider';
import { Field } from '@/components/ui/field';
import { ReadField } from '@/components/ui/read-field';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import type {
  BugDraft,
  Defect,
  ExploratoryAttachment,
  ExploratoryExecution,
  ExploratoryFlow,
  ExploratoryStatus,
} from '@/lib/api/types';
import { FREQUENCIES, IMPACTS } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useExploratoriaMutations } from '../use-exploratoria';

interface FlowDetailProps {
  flow: ExploratoryFlow;
  execution?: ExploratoryExecution;
  defects: Defect[];
  attachments: ExploratoryAttachment[];
  runId: number;
  isFinished: boolean;
  projectId: number | null;
  /** Si el tester no declaró la cobertura de TC, se avisa al guardar. */
  coverageReady?: boolean;
}

const STATUS_BUTTONS: Array<{
  value: ExploratoryStatus;
  label: string;
  icon: typeof CircleCheck;
  className: string;
}> = [
  {
    value: 'OK',
    label: 'OK',
    icon: CircleCheck,
    className: 'border-ok/40 text-ok hover:bg-ok-soft data-[active=true]:bg-ok data-[active=true]:text-white',
  },
  {
    value: 'FAIL',
    label: 'FAIL',
    icon: CircleX,
    className:
      'border-fail/40 text-fail hover:bg-fail-soft data-[active=true]:bg-fail data-[active=true]:text-white',
  },
  {
    value: 'WARNING',
    label: 'WARN',
    icon: TriangleAlert,
    className:
      'border-warn/40 text-warn hover:bg-warn-soft data-[active=true]:bg-warn data-[active=true]:text-white',
  },
  {
    value: 'BLOCK',
    label: 'BLOCK',
    icon: CircleSlash,
    className:
      'border-warn/40 text-warn hover:bg-warn-soft data-[active=true]:bg-warn data-[active=true]:text-white',
  },
  {
    value: 'SKIP',
    label: 'SKIP',
    icon: SkipForward,
    className:
      'border-border-strong text-fg-muted hover:bg-fill-soft data-[active=true]:bg-fg-muted data-[active=true]:bg-fg-muted data-[active=true]:text-bg',
  },
];

const SEVERITIES = [
  { value: 'Crítica', label: 'Crítica' },
  { value: 'Alta', label: 'Alta' },
  { value: 'Media', label: 'Media' },
  { value: 'Baja', label: 'Baja' },
];

function emptyBug(expected = ''): BugDraft {
  return {
    title: '',
    description: '',
    severity: 'Media',
    steps_to_reproduce: '',
    expected_result: expected,
    actual_result: '',
    frequency: 'Siempre',
    business_impact: '',
    observations: '',
  };
}

/** Draft editable a partir de un defecto ya guardado (mantiene los detalles). */
function bugFromDefect(defect: Defect): BugDraft {
  return {
    id: defect.id,
    title: defect.title ?? '',
    description: defect.description ?? '',
    severity: defect.severity ?? 'Media',
    steps_to_reproduce: defect.steps_to_reproduce ?? '',
    expected_result: defect.expected_result ?? '',
    actual_result: defect.actual_result ?? '',
    frequency: defect.frequency ?? 'Siempre',
    business_impact: defect.business_impact ?? '',
    observations: defect.observations ?? '',
  };
}

/**
 * Detalle de un flujo exploratorio.
 * Un solo guardado persiste status + justificación + resultado + bug,
 * y después sube las evidencias pendientes contra el execution_id.
 */
export function FlowDetail({
  flow,
  execution,
  defects,
  attachments,
  runId,
  isFinished,
  projectId,
  coverageReady = true,
}: FlowDetailProps) {
  const confirm = useConfirm();
  const { executeFlow, uploadEvidence, deleteEvidence } = useExploratoriaMutations(projectId, runId);

  const [status, setStatus] = useState<ExploratoryStatus>(
    (execution?.status as ExploratoryStatus) || 'OK',
  );
  const [observations, setObservations] = useState(execution?.observations ?? '');
  const [obtained, setObtained] = useState(execution?.obtained_result ?? '');
  const [bug, setBug] = useState<BugDraft>(emptyBug(flow.expected_result ?? ''));
  const [category, setCategory] = useState('GENERAL');
  const [pending, setPending] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadedDefectKey = useRef('');

  // Al abrir el flujo, o cuando se guarda un defecto, precargamos el formulario
  // con los datos persistidos para que no se "pierdan" los detalles.
  useEffect(() => {
    const latest = defects[defects.length - 1];
    const key = `${flow.id}:${latest?.id ?? 'none'}`;
    if (loadedDefectKey.current === key) return;
    loadedDefectKey.current = key;
    setBug(latest ? bugFromDefect(latest) : emptyBug(flow.expected_result ?? ''));
  }, [defects, flow.id, flow.expected_result]);

  const needsJustification = status === 'BLOCK' || status === 'SKIP';
  const allowsBug = status === 'FAIL' || status === 'WARNING';
  const executionAttachments = execution
    ? attachments.filter((item) => item.execution_id === execution.id)
    : [];

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (list.length === 0) {
      toast.warning('Solo se permiten imágenes');
      return;
    }
    setPending((current) => [...current, ...list]);
  };

  const handleSave = async () => {
    if (isFinished) return;

    if (!coverageReady) {
      toast.warning(
        'Cobertura de TC sin declarar: el reporte de estatus saldrá con alerta',
      );
    }

    if (needsJustification && !observations.trim()) {
      toast.warning(`La justificación del ${status === 'SKIP' ? 'salto' : 'bloqueo'} es obligatoria`);
      return;
    }

    if (allowsBug && !bug.title.trim() && status === 'FAIL') {
      toast.warning('Un FAIL requiere reportar un defecto');
      return;
    }

    const result = await executeFlow.mutateAsync({
      tcId: flow.id,
      input: {
        run_id: runId,
        status,
        observations: observations.trim(),
        obtained_result: obtained.trim(),
        ...(allowsBug && bug.title.trim() ? { bugs: [bug] } : {}),
      },
    });

    if (result.execution_id && pending.length > 0) {
      for (const file of pending) {
        await uploadEvidence.mutateAsync({
          file,
          executionId: result.execution_id,
          category,
        });
      }
      setPending([]);
    }
  };

  const handleDeleteEvidence = async (attachment: ExploratoryAttachment) => {
    const ok = await confirm({
      title: 'Eliminar evidencia',
      description: '¿Eliminar esta captura?',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (ok) deleteEvidence.mutate(attachment.id);
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="grid gap-3 md:grid-cols-2">
        <ReadField
          label="Pasos"
          value={flow.steps}
          empty="Sin pasos definidos."
          mono
          maxHeightClassName="max-h-40"
        />
        <ReadField
          label="Resultado esperado"
          value={flow.expected_result}
          empty="Sin resultado esperado definido."
          maxHeightClassName="max-h-40"
        />
      </div>

      {defects.length > 0 ? (
        <div className="space-y-2">
          <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
            Defectos reportados ({defects.length})
          </span>
          {defects.map((defect) => (
            <div
              key={defect.id}
              className="space-y-2 rounded-md border border-fail/30 bg-fail-soft/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Bug className="size-3.5 shrink-0 text-fail" />
                <span className="text-footnote font-semibold text-fg">{defect.title}</span>
                <Badge
                  tone={
                    defect.severity === 'Crítica' || defect.severity === 'Alta'
                      ? 'fail'
                      : defect.severity === 'Baja'
                        ? 'ok'
                        : 'warn'
                  }
                >
                  {defect.severity ?? 'Media'}
                </Badge>
                <Badge tone="outline">{defect.status ?? 'OPEN'}</Badge>
                <span className="text-caption text-fg-subtle">#{defect.id}</span>
              </div>

              {defect.description ? (
                <ReadField label="Descripción" value={defect.description} />
              ) : null}
              {defect.steps_to_reproduce ? (
                <ReadField label="Pasos para reproducir" value={defect.steps_to_reproduce} mono />
              ) : null}
              {defect.expected_result ? (
                <ReadField label="Resultado esperado" value={defect.expected_result} />
              ) : null}
              {defect.actual_result ? (
                <ReadField label="Resultado real" value={defect.actual_result} />
              ) : null}
              {defect.frequency ? (
                <ReadField label="Frecuencia" value={defect.frequency} />
              ) : null}
              {defect.business_impact ? (
                <ReadField label="Impacto de negocio" value={defect.business_impact} />
              ) : null}
              {defect.observations ? (
                <ReadField label="Observaciones" value={defect.observations} />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
            Evidencias ({executionAttachments.length + pending.length})
          </span>
          <div className="w-36">
            <SelectField
              value={category}
              onValueChange={setCategory}
              options={[
                { value: 'GENERAL', label: 'General' },
                { value: 'FIGMA', label: 'Figma' },
                { value: 'DEV', label: 'Sistema' },
                { value: 'BUG', label: 'Error' },
              ]}
              aria-label="Categoría de la evidencia"
            />
          </div>
        </div>

        {!isFinished ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              Agregar captura
            </Button>
            <span className="text-caption text-fg-subtle">
              {execution ? 'Se sube al guardar el flujo.' : 'Se suben junto con el primer guardado.'}
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
        ) : null}

        {executionAttachments.length + pending.length === 0 ? (
          <p className="text-caption text-fg-subtle">Sin evidencias.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {executionAttachments.map((attachment) => (
              <li key={attachment.id} className="group relative w-28 overflow-hidden rounded-lg border border-border">
                <a href={`/api/evidence/${attachment.id}`} target="_blank" rel="noopener noreferrer">
                  <img
                    src={`/api/evidence/${attachment.id}`}
                    alt={attachment.file_name ?? 'Evidencia'}
                    className="h-20 w-full object-cover"
                    loading="lazy"
                  />
                </a>
                {!isFinished ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    className="absolute right-1 top-1 size-6 opacity-0 group-hover:opacity-100"
                    aria-label="Eliminar evidencia"
                    onClick={() => handleDeleteEvidence(attachment)}
                  >
                    <X />
                  </Button>
                ) : null}
              </li>
            ))}

            {pending.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="group relative w-28 overflow-hidden rounded-lg border border-dashed border-brand"
              >
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="h-20 w-full object-cover opacity-80"
                />
                <span className="absolute bottom-1 left-1 rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                  PENDIENTE
                </span>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  className="absolute right-1 top-1 size-6 opacity-0 group-hover:opacity-100"
                  aria-label="Quitar archivo"
                  onClick={() => setPending((current) => current.filter((_, i) => i !== index))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {needsJustification ? (
        <Field
          label={status === 'SKIP' ? 'Justificación del salto' : 'Justificación del bloqueo'}
          htmlFor={`flow-obs-${flow.id}`}
          hint="Obligatoria."
        >
          <Textarea
            id={`flow-obs-${flow.id}`}
            className="min-h-16"
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
            disabled={isFinished}
          />
        </Field>
      ) : null}

      <Field label="Resultado obtenido (opcional)" htmlFor={`flow-obtained-${flow.id}`}>
        <Textarea
          id={`flow-obtained-${flow.id}`}
          className="min-h-16"
          value={obtained}
          onChange={(event) => setObtained(event.target.value)}
          disabled={isFinished}
          placeholder="Qué observaste durante la exploración…"
        />
      </Field>

      {allowsBug ? (
        <div className="space-y-2 rounded-lg border border-fail/30 bg-fail-soft/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption font-bold uppercase tracking-wide text-fail">
              Reporte de defecto
            </span>
            {bug.id ? (
              <span className="text-caption text-fg-subtle">Editando #{bug.id}</span>
            ) : null}
          </div>

          <div className="grid grid-cols-[1fr_140px] gap-2">
            <Field label="Título" htmlFor={`flow-bug-title-${flow.id}`}>
              <Input
                id={`flow-bug-title-${flow.id}`}
                value={bug.title}
                onChange={(event) => setBug({ ...bug, title: event.target.value })}
                disabled={isFinished}
                placeholder="Resumen del defecto"
              />
            </Field>
            <Field label="Severidad" htmlFor={`flow-bug-sev-${flow.id}`}>
              <SelectField
                id={`flow-bug-sev-${flow.id}`}
                value={bug.severity}
                onValueChange={(value) => setBug({ ...bug, severity: value })}
                options={SEVERITIES}
                disabled={isFinished}
              />
            </Field>
          </div>

          <Field label="Descripción" htmlFor={`flow-bug-description-${flow.id}`}>
            <Textarea
              id={`flow-bug-description-${flow.id}`}
              className="min-h-16"
              value={bug.description}
              onChange={(event) => setBug({ ...bug, description: event.target.value })}
              disabled={isFinished}
              placeholder="Qué está fallando y en qué contexto"
            />
          </Field>

          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Resultado esperado" htmlFor={`flow-bug-expected-${flow.id}`}>
              <Textarea
                id={`flow-bug-expected-${flow.id}`}
                className="min-h-16"
                value={bug.expected_result}
                onChange={(event) => setBug({ ...bug, expected_result: event.target.value })}
                disabled={isFinished}
              />
            </Field>
            <Field label="Resultado real" htmlFor={`flow-bug-actual-${flow.id}`}>
              <Textarea
                id={`flow-bug-actual-${flow.id}`}
                className="min-h-16"
                value={bug.actual_result}
                onChange={(event) => setBug({ ...bug, actual_result: event.target.value })}
                disabled={isFinished}
              />
            </Field>
          </div>

          <Field label="Pasos para reproducir" htmlFor={`flow-bug-steps-${flow.id}`}>
            <Textarea
              id={`flow-bug-steps-${flow.id}`}
              className="min-h-16"
              value={bug.steps_to_reproduce}
              onChange={(event) => setBug({ ...bug, steps_to_reproduce: event.target.value })}
              disabled={isFinished}
            />
          </Field>

          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Frecuencia" htmlFor={`flow-bug-frequency-${flow.id}`}>
              <SelectField
                id={`flow-bug-frequency-${flow.id}`}
                value={bug.frequency}
                onValueChange={(value) => setBug({ ...bug, frequency: value })}
                options={FREQUENCIES.map((value) => ({ value, label: value }))}
                disabled={isFinished}
              />
            </Field>
            <Field label="Impacto de negocio" htmlFor={`flow-bug-impact-${flow.id}`}>
              <SelectField
                id={`flow-bug-impact-${flow.id}`}
                value={bug.business_impact}
                onValueChange={(value) => setBug({ ...bug, business_impact: value })}
                allowEmpty
                placeholder="Sin especificar"
                options={IMPACTS.filter(Boolean).map((value) => ({ value, label: value }))}
                disabled={isFinished}
              />
            </Field>
          </div>

          <Field label="Observaciones" htmlFor={`flow-bug-observations-${flow.id}`}>
            <Textarea
              id={`flow-bug-observations-${flow.id}`}
              className="min-h-16"
              value={bug.observations}
              onChange={(event) => setBug({ ...bug, observations: event.target.value })}
              disabled={isFinished}
            />
          </Field>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
          Resultado
        </span>
        <div className="flex flex-wrap gap-1">
          {STATUS_BUTTONS.map((button) => {
            const Icon = button.icon;
            return (
              <button
                key={button.value}
                type="button"
                data-active={status === button.value}
                onClick={() => setStatus(button.value)}
                disabled={isFinished}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-caption font-bold transition-colors disabled:opacity-50',
                  button.className,
                )}
              >
                <Icon className="size-3.5" />
                {button.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {!isFinished ? (
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={executeFlow.isPending || uploadEvidence.isPending}
          >
            <Save />
            Guardar flujo
          </Button>
        ) : (
          <Badge tone="ok">Sesión finalizada</Badge>
        )}
      </div>
    </div>
  );
}
