import type { UseFormRegister } from 'react-hook-form';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import type { StoryFormValues } from '../../lib/story-form';

interface TextareaTabProps {
  label: string;
  name: 'reglas_negocio' | 'precondiciones';
  placeholder: string;
  register: UseFormRegister<StoryFormValues>;
}

/** Tab simple de texto largo (Reglas de negocio / Precondiciones). */
export function TextareaTab({ label, name, placeholder, register }: TextareaTabProps) {
  return (
    <Field label={label} htmlFor={`story-${name}`} hint="Se guarda con el botón “Guardar” del encabezado.">
      <Textarea
        id={`story-${name}`}
        className="min-h-56"
        placeholder={placeholder}
        {...register(name)}
      />
    </Field>
  );
}
