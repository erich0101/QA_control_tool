import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { cn } from '@/lib/utils';

export interface SelectFieldOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id?: string;
  value?: string;
  onValueChange: (value: string) => void;
  options: SelectFieldOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  /** Permite limpiar la selección (Radix usa '' para el placeholder). */
  allowEmpty?: boolean;
}

/** Select del design system listo para usar dentro de formularios. */
export function SelectField({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Seleccionar…',
  className,
  disabled,
  allowEmpty = false,
  ...aria
}: SelectFieldProps) {
  return (
    <Select value={value ?? ''} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className={cn(className)} aria-label={aria['aria-label']}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty ? <SelectItem value="">{placeholder}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
