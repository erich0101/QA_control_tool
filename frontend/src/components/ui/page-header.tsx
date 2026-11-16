import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Etiqueta corta sobre el título (sección / contexto). */
  eyebrow?: ReactNode;
  /** Badge o estado junto al título. */
  badge?: ReactNode;
  /** Acciones alineadas a la derecha en desktop y debajo en mobile. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabecera estándar de pantalla: contexto + título + descripción + acciones.
 * Evita repetir el mismo header en cada feature y mantiene el título a ancho
 * completo en resoluciones bajas.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('border-b border-border bg-surface px-5 py-3', className)}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="min-w-0 whitespace-normal break-words text-title3 font-semibold leading-snug text-fg">
              {title}
            </h1>
            {badge}
          </div>
          {description ? (
            <p className="mt-0.5 text-footnote text-fg-muted">{description}</p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
