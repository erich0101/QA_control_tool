import { ExternalLink, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JiraTraceBadgeProps {
  jiraKey?: string | null;
  jiraUrl?: string | null;
  jiraStatus?: string | null;
  /** Texto cuando el registro todavía no tiene ticket. */
  emptyLabel?: string;
  className?: string;
}

/**
 * Trazabilidad visual del ticket de Jira asociado a un bug, hallazgo o
 * defecto de un TC. Si no hay ticket lo dice explícitamente: la ausencia de
 * un link no debe confundirse con un ticket existente.
 */
export function JiraTraceBadge({
  jiraKey,
  jiraUrl,
  jiraStatus,
  emptyLabel = 'Sin ticket Jira',
  className,
}: JiraTraceBadgeProps) {
  if (!jiraKey) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-fill-soft px-2 py-0.5 text-caption font-medium text-fg-subtle',
          className,
        )}
        title="Todavía no se creó un ticket en Jira"
      >
        <Ticket className="size-3" />
        {emptyLabel}
      </span>
    );
  }

  return (
    <a
      href={jiraUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 text-caption font-semibold text-brand transition-colors hover:border-brand hover:underline',
        className,
      )}
      title={
        jiraStatus
          ? `Ticket Jira ${jiraKey} · Estado en Jira: ${jiraStatus}`
          : `Ticket Jira ${jiraKey}`
      }
    >
      <Ticket className="size-3" />
      {jiraKey}
      <ExternalLink className="size-2.5" />
    </a>
  );
}
