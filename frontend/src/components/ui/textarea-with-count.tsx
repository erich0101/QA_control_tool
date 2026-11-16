import * as React from 'react';
import { cn } from '@/lib/utils';

interface TextareaWithCountProps extends React.ComponentProps<'textarea'> {
  /** Máximo de caracteres; el contador usa este valor. */
  maxLength: number;
  /** Muestra el contador `usados/máximo`. Default true. */
  showCount?: boolean;
}

/**
 * Textarea con contador de caracteres.
 * Mantiene el ref para poder usarse con react-hook-form (`register`).
 */
export const TextareaWithCount = React.forwardRef<HTMLTextAreaElement, TextareaWithCountProps>(
  ({ className, maxLength, showCount = true, value, onChange, ...props }, ref) => {
    const [length, setLength] = React.useState(String(value ?? '').length);

    React.useEffect(() => {
      if (value !== undefined) setLength(String(value).length);
    }, [value]);

    return (
      <div className="space-y-1">
        <textarea
          ref={ref}
          maxLength={maxLength}
          value={value}
          onChange={(event) => {
            setLength(event.currentTarget.value.length);
            onChange?.(event);
          }}
          className={cn(
            'flex min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg shadow-apple-sm',
            'placeholder:text-fg-subtle',
            'focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'aria-[invalid=true]:border-fail aria-[invalid=true]:ring-fail/30',
            className,
          )}
          {...props}
        />
        {showCount ? (
          <p
            className={cn(
              'text-right text-caption text-fg-subtle',
              length >= maxLength && 'font-semibold text-warn',
            )}
            aria-live="polite"
          >
            {length}/{maxLength}
          </p>
        ) : null}
      </div>
    );
  },
);
TextareaWithCount.displayName = 'TextareaWithCount';
