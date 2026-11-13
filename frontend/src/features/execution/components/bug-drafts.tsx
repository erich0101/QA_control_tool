import { ClipboardCopy, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import type { BugDraft } from '@/lib/api/types';

interface BugDraftsProps {
  drafts: BugDraft[];
  baseSteps: string;
  baseExpected: string;
  onChange: (drafts: BugDraft[]) => void;
}

const SEVERITIES = [
  { value: 'Alta', label: 'Alta' },
  { value: 'Media', label: 'Media' },
  { value: 'Baja', label: 'Baja' },
];

export function emptyBugDraft(expected = ''): BugDraft {
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

/**
 * Borradores de defectos para un FAIL.
 * Se envían dentro del mismo PUT del resultado (`bugs: [...]`), así se crea un
 * defecto por tarjeta en una sola operación.
 */
export function BugDrafts({ drafts, baseSteps, baseExpected, onChange }: BugDraftsProps) {
  const update = (index: number, patch: Partial<BugDraft>) => {
    onChange(drafts.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
  };

  return (
    <div className="space-y-2 rounded-lg border border-fail/30 bg-fail-soft/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-caption font-bold uppercase tracking-wide text-fail">
          Reporte de defecto ({drafts.length})
        </span>
        <span className="text-caption text-fg-subtle">Se crea un bug por tarjeta con título</span>
      </div>

      {drafts.map((draft, index) => (
        <div key={index} className="space-y-2 rounded-md border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <span className="text-caption font-bold text-fail">BUG {index + 1}</span>
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-fail"
              aria-label={`Quitar bug ${index + 1}`}
              disabled={drafts.length <= 1}
              onClick={() => onChange(drafts.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </Button>
          </div>

          <div className="grid grid-cols-[1fr_130px] gap-2">
            <Field label="Título" htmlFor={`bug-title-${index}`}>
              <Input
                id={`bug-title-${index}`}
                placeholder="Resumen del defecto"
                value={draft.title}
                onChange={(event) => update(index, { title: event.target.value })}
              />
            </Field>

            <Field label="Severidad" htmlFor={`bug-sev-${index}`}>
              <SelectField
                id={`bug-sev-${index}`}
                value={draft.severity}
                onValueChange={(value) => update(index, { severity: value })}
                options={SEVERITIES}
              />
            </Field>
          </div>

          <Field label="Descripción" htmlFor={`bug-desc-${index}`}>
            <Textarea
              id={`bug-desc-${index}`}
              className="min-h-16"
              placeholder="Contexto adicional (opcional)"
              value={draft.description}
              onChange={(event) => update(index, { description: event.target.value })}
            />
          </Field>

          <Field label="Pasos para reproducir" htmlFor={`bug-steps-${index}`}>
            <div className="flex items-start gap-2">
              <Textarea
                id={`bug-steps-${index}`}
                className="min-h-20 flex-1"
                value={draft.steps_to_reproduce}
                onChange={(event) => update(index, { steps_to_reproduce: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Copiar pasos del test"
                aria-label="Copiar pasos del test"
                onClick={() => update(index, { steps_to_reproduce: baseSteps })}
              >
                <ClipboardCopy />
              </Button>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Resultado esperado" htmlFor={`bug-expected-${index}`}>
              <Textarea
                id={`bug-expected-${index}`}
                className="min-h-16"
                value={draft.expected_result}
                onChange={(event) => update(index, { expected_result: event.target.value })}
              />
            </Field>

            <Field label="Resultado real" htmlFor={`bug-actual-${index}`}>
              <Textarea
                id={`bug-actual-${index}`}
                className="min-h-16"
                value={draft.actual_result}
                onChange={(event) => update(index, { actual_result: event.target.value })}
              />
            </Field>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full border border-dashed border-border"
        onClick={() => onChange([...drafts, emptyBugDraft(baseExpected)])}
      >
        <Plus />
        Agregar otro defecto
      </Button>
    </div>
  );
}
