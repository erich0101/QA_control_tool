import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Sin tarjeta (fondo/borde), para secciones dentro de otra tarjeta. */
  bare?: boolean;
}

/**
 * Sección de contenido con título, descripción y acciones.
 * Centraliza el espaciado y el borde que hoy se repite en cada pantalla.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  bare = false,
}: SectionProps) {
  return (
    <section
      className={cn(
        !bare && 'rounded-xl border border-border bg-surface shadow-apple-sm',
        className,
      )}
    >
      {title || description || actions ? (
        <div
          className={cn(
            'flex flex-wrap items-start gap-2 px-4 py-3',
            !bare && 'border-b border-border',
          )}
        >
          <div className="min-w-0 flex-1">
            {title ? (
              <h2 className="text-footnote font-semibold text-fg">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-caption text-fg-subtle">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn('p-4', contentClassName)}>{children}</div>
    </section>
  );
}
