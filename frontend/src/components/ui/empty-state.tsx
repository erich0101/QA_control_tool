import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Estado vacío reutilizable: reemplaza los bloques "no hay datos" copiados en cada tab. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <div className="text-fg-subtle [&_svg]:size-8">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-fg">{title}</p>
        {description ? <p className="max-w-md text-footnote text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
