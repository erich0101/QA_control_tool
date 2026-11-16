import { CalendarDays } from 'lucide-react';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  /** `true` para fecha + hora (`datetime-local`). */
  withTime?: boolean;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  name?: string;
  onBlur?: () => void;
}

/**
 * Selector de fecha del design system. Usa el control nativo (accesible y sin
 * dependencias adicionales) y unifica el icono, el borde y el tamaño.
 */
export function DatePicker({
  id,
  value,
  onChange,
  withTime = false,
  min,
  max,
  required,
  disabled,
  className,
  name,
  onBlur,
  ...aria
}: DatePickerProps) {
  return (
    <div className="relative">
      <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
      <Input
        id={id}
        name={name}
        type={withTime ? 'datetime-local' : 'date'}
        value={value ?? ''}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        className={cn('pl-8', className)}
        {...aria}
      />
    </div>
  );
}
