import { cn } from '@/lib/utils';

interface ReadFieldProps {
  label: string;
  value?: string | number | null;
  /** Texto cuando no hay valor. */
  empty?: string;
  /** Pasos/código: fuente monoespaciada. */
  mono?: boolean;
  /** Clase de altura máxima del bloque de valor (default `max-h-48`). */
  maxHeightClassName?: string;
  className?: string;
}

/**
 * Campo de solo lectura del design system: label + bloque de texto.
 *
 * Es el equivalente read-only de `Field` (misma tipografía de label) y el
 * ÚNICO lugar donde debe vivirse el markup de un valor multilínea con label.
 * Si una pantalla necesita mostrar "Descripción", "Pasos", "Resultado
 * esperado", etc., usa este componente en vez de armar <p>/<pre> a mano.
 *
 * Hay un chequeo automático (`npm run check:ui`) que falla si aparece
 * `whitespace-pre-wrap` fuera de este archivo o de la allowlist de viewers
 * de código/comentarios.
 */
export function ReadField({
  label,
  value,
  empty = '—',
  mono = false,
  maxHeightClassName = 'max-h-48',
  className,
}: ReadFieldProps) {
  const text = value === null || value === undefined ? '' : String(value).trim();

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-footnote font-medium text-fg-muted">{label}</p>
      <div
        className={cn(
          'scrollbar-apple overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-footnote leading-relaxed text-fg',
          maxHeightClassName,
          mono && 'font-mono',
        )}
      >
        {text || <span className="text-fg-subtle">{empty}</span>}
      </div>
    </div>
  );
}
