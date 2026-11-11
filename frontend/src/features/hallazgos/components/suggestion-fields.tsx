import { Controller, useFormContext } from 'react-hook-form';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import {
  SUGGESTION_CATEGORIES,
  SUGGESTION_PRIORITIES,
  type User,
} from '@/lib/api/types';
import type { SuggestionFormValues } from '../lib/forms';

const CATEGORY_OPTIONS = SUGGESTION_CATEGORIES.map((value) => ({ value, label: value }));
const PRIORITY_OPTIONS = SUGGESTION_PRIORITIES.map((value) => ({ value, label: value }));

export function SuggestionFields({ team }: { team: User[] }) {
  const { register, control, formState } = useFormContext<SuggestionFormValues>();

  return (
    <div className="space-y-4">
      <Field label="Título" htmlFor="s-title" error={formState.errors.title?.message}>
        <Input
          id="s-title"
          placeholder="Resumen de la sugerencia…"
          aria-invalid={Boolean(formState.errors.title)}
          {...register('title', { required: 'El título es obligatorio' })}
        />
      </Field>

      <Field label="Descripción" htmlFor="s-description">
        <Textarea
          id="s-description"
          className="min-h-24"
          placeholder="Qué mejorarías y por qué…"
          {...register('description')}
        />
      </Field>

      <Field label="Solución propuesta" htmlFor="s-solution">
        <Textarea
          id="s-solution"
          className="min-h-24"
          placeholder="Cómo lo resolverías…"
          {...register('proposed_solution')}
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-3">
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Field label="Categoría" htmlFor="s-category">
              <SelectField
                id="s-category"
                value={field.value}
                onValueChange={field.onChange}
                options={CATEGORY_OPTIONS}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="priority"
          render={({ field }) => (
            <Field label="Prioridad" htmlFor="s-priority">
              <SelectField
                id="s-priority"
                value={field.value}
                onValueChange={field.onChange}
                options={PRIORITY_OPTIONS}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="assigned_to"
          render={({ field }) => (
            <Field label="Asignado a" htmlFor="s-assignee">
              <SelectField
                id="s-assignee"
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
    </div>
  );
}
