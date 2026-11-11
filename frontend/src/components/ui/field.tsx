import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Envoltorio de campo: label + control + hint/error.
 * Evita repetir el markup de label/error en cada formulario.
 */
export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-footnote font-medium text-fg-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-caption text-fail">{error}</p>
      ) : hint ? (
        <p className="text-caption text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
