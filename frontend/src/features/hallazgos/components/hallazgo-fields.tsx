import { Controller, useFormContext } from 'react-hook-form';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import {
  FREQUENCIES,
  HALLZGO_SEVERITIES,
  IMPACTS,
  type User,
} from '@/lib/api/types';
import type { HallazgoFormValues } from '../lib/forms';

const SEVERITY_OPTIONS = HALLZGO_SEVERITIES.map((value) => ({ value, label: value }));
const FREQUENCY_OPTIONS = FREQUENCIES.map((value) => ({ value, label: value }));
const IMPACT_OPTIONS = IMPACTS.filter(Boolean).map((value) => ({ value, label: value }));

/**
 * Campos del hallazgo, compartidos por el alta y el detalle.
 * Usa el contexto de react-hook-form (`FormProvider`).
 */
export function HallazgoFields({ team }: { team: User[] }) {
  const { register, control, formState } = useFormContext<HallazgoFormValues>();

  return (
    <div className="space-y-4">
      <Field label="Título" htmlFor="h-title" error={formState.errors.title?.message}>
        <Input
          id="h-title"
          placeholder="Resumen del hallazgo…"
          aria-invalid={Boolean(formState.errors.title)}
          {...register('title', { required: 'El título es obligatorio' })}
        />
      </Field>

      <Field label="Descripción" htmlFor="h-description">
        <Textarea
          id="h-description"
          className="min-h-24"
          placeholder="Qué se detectó, en qué flujo y con qué frecuencia…"
          {...register('description')}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Pasos para reproducir" htmlFor="h-steps">
          <Textarea
            id="h-steps"
            className="min-h-24"
            placeholder={'1. Ir a…\n2. Hacer clic en…\n3. Observar…'}
            {...register('steps_to_reproduce')}
          />
        </Field>

        <Field label="Resultado esperado" htmlFor="h-expected">
          <Textarea id="h-expected" className="min-h-24" {...register('expected_result')} />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Precondiciones" htmlFor="h-preconditions">
          <Textarea id="h-preconditions" className="min-h-20" {...register('preconditions')} />
        </Field>

        <Field label="Resultado obtenido" htmlFor="h-actual">
          <Textarea id="h-actual" className="min-h-20" {...register('actual_result')} />
        </Field>
      </div>

      <Field label="Observaciones" htmlFor="h-observations">
        <Textarea
          id="h-observations"
          className="min-h-20"
          placeholder="Notas, workarounds, links relacionados…"
          {...register('observations')}
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-4">
        <Controller
          control={control}
          name="severity"
          render={({ field }) => (
            <Field label="Severidad" htmlFor="h-severity">
              <SelectField
                id="h-severity"
                value={field.value}
                onValueChange={field.onChange}
                options={SEVERITY_OPTIONS}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="frequency"
          render={({ field }) => (
            <Field label="Frecuencia" htmlFor="h-frequency">
              <SelectField
                id="h-frequency"
                value={field.value}
                onValueChange={field.onChange}
                options={FREQUENCY_OPTIONS}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="business_impact"
          render={({ field }) => (
            <Field label="Impacto" htmlFor="h-impact">
              <SelectField
                id="h-impact"
                value={field.value}
                onValueChange={field.onChange}
                allowEmpty
                placeholder="Sin especificar"
                options={IMPACT_OPTIONS}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="assigned_to"
          render={({ field }) => (
            <Field label="Asignado a" htmlFor="h-assignee">
              <SelectField
                id="h-assignee"
                value={field.value}
                onValueChange={field.onChange}
                allowEmpty
                placeholder="Sin asignar"
                options={team.map((user) => ({ value: String(user.id), label: user.name }))}
              />
            </Field>
          )}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Componente" htmlFor="h-component">
          <Input id="h-component" placeholder="Login, Checkout, API…" {...register('component')} />
        </Field>

        <Field label="Épica de Jira" htmlFor="h-epic" hint="Se usa al crear el ticket en Jira.">
          <Input id="h-epic" placeholder="AGIP-117" {...register('jira_epic_key')} />
        </Field>
      </div>
    </div>
  );
}
