import { useState } from 'react';
import { Copy, ExternalLink, RefreshCw, Ticket, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/client';
import { jiraIssueUrl } from '@/lib/api/jira';
import { getJiraErrorCode, JiraSetupState } from '@/features/jira/components/jira-setup-state';
import type { JiraTicket, MyJiraFilter } from '@/lib/api/types';
import { cn, formatDate } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { useMyJiraTickets } from './use-mi-jira';

const FILTERS: Array<{ id: MyJiraFilter; label: string; empty: string }> = [
  { id: 'assigned', label: 'Asignados', empty: 'No tenés tickets asignados en este proyecto.' },
  { id: 'created', label: 'Creados', empty: 'No creaste tickets en este proyecto.' },
  { id: 'mentions', label: 'Menciones', empty: 'No te mencionaron en comentarios de este proyecto.' },
];

const TYPE_TONE: Record<string, 'fail' | 'brand' | 'ok' | 'neutral'> = {
  Bug: 'fail',
  Task: 'brand',
  Story: 'ok',
  Epic: 'brand',
  Subtask: 'brand',
  'Sub-task': 'brand',
};

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'brand' | 'neutral'> = {
  done: 'ok',
  indeterminate: 'warn',
  new: 'neutral',
};

export function MiJiraPage() {
  const projectId = useUiStore((s) => s.activeProjectId);
  const [filter, setFilter] = useState<MyJiraFilter>('assigned');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data: tickets = [], isLoading, isFetching, refetch, error } = useMyJiraTickets(
    projectId,
    filter,
  );

  const activeFilter = FILTERS.find((item) => item.id === filter)!;
  const selected = tickets.find((ticket) => ticket.key === selectedKey) ?? null;

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success(`${key} copiado`);
    } catch {
      toast.error('No se pudo copiar la clave');
    }
  };

  const errorMessage =
    error instanceof ApiError
      ? error.message
      : error
        ? 'No se pudieron cargar los tickets de Jira.'
        : null;

  if (!projectId) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState
          icon={<Ticket />}
          title="Seleccioná un proyecto"
          description="Usá el selector de la barra superior para ver tus tickets."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-5 py-2.5">
        <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
          Mi JIRA
        </span>

        <div className="inline-flex gap-1 rounded-full bg-fill p-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setFilter(item.id);
                setSelectedKey(null);
              }}
              aria-pressed={filter === item.id}
              className={cn(
                'rounded-full px-3 py-1 text-caption font-semibold transition-colors',
                filter === item.id ? 'bg-brand text-white' : 'text-fg-muted hover:text-fg',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <Badge tone="neutral">
          {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
        </Badge>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          loading={isFetching}
          onClick={() => {
            setSelectedKey(null);
            refetch();
          }}
        >
          <RefreshCw />
          Refrescar
        </Button>
      </header>

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : errorMessage ? (
          <div className="p-8">
            <JiraSetupState
              projectId={projectId}
              code={getJiraErrorCode(error)}
              message={errorMessage}
              icon={<Ticket />}
            />
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-8">
            <EmptyState icon={<Ticket />} title="Sin tickets" description={activeFilter.empty} />
          </div>
        ) : (
          <DataTable
            bare
            stickyHeader
            columns={[
              {
                id: 'key',
                header: 'Clave',
                headerClassName: 'w-28',
                cell: (ticket) => (
                  <span className="font-mono text-caption font-semibold text-brand">
                    {ticket.key}
                  </span>
                ),
              },
              {
                id: 'type',
                header: 'Tipo',
                headerClassName: 'w-24',
                cell: (ticket) => (
                  <Badge tone={TYPE_TONE[ticket.issueType ?? ''] ?? 'neutral'}>
                    {ticket.issueType ?? '—'}
                  </Badge>
                ),
              },
              {
                id: 'summary',
                header: 'Resumen',
                cell: (ticket) => (
                  <>
                    <span className="mr-1 text-fg-subtle">{ticket.parent ? '└' : ''}</span>
                    <span className="text-fg">{ticket.summary ?? '—'}</span>
                    {filter === 'mentions' && (ticket.mentions?.length ?? 0) > 0 ? (
                      <Badge tone="brand" className="ml-2">
                        {ticket.mentions?.length}{' '}
                        {ticket.mentions?.length === 1 ? 'mención' : 'menciones'}
                      </Badge>
                    ) : null}
                  </>
                ),
              },
              {
                id: 'status',
                header: 'Estado',
                headerClassName: 'w-40',
                cell: (ticket) => (
                  <Badge tone={STATUS_TONE[ticket.statusCategory ?? ''] ?? 'neutral'}>
                    {ticket.status ?? '—'}
                  </Badge>
                ),
              },
            ]}
            rows={tickets}
            getRowId={(ticket) => ticket.key}
            onRowClick={(ticket) => setSelectedKey(ticket.key === selectedKey ? null : ticket.key)}
            activeRowId={selectedKey}
          />
        )}
      </div>

      {selected ? (
        <TicketDetail ticket={selected} onClose={() => setSelectedKey(null)} onCopy={copyKey} />
      ) : null}
    </div>
  );
}

function TicketDetail({
  ticket,
  onClose,
  onCopy,
}: {
  ticket: JiraTicket;
  onClose: () => void;
  onCopy: (key: string) => void;
}) {
  const comments = [...(ticket.comments ?? [])].sort(
    (a, b) => new Date(b.created ?? 0).getTime() - new Date(a.created ?? 0).getTime(),
  );
  const mentionCount = ticket.mentions?.length ?? 0;

  return (
    <section className="shrink-0 border-t border-border bg-surface">
      <div className="flex items-start gap-3 px-5 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-caption font-bold text-brand">{ticket.key}</span>
            {ticket.status ? <Badge tone="warn">{ticket.status}</Badge> : null}
            {ticket.issueType ? (
              <Badge tone={TYPE_TONE[ticket.issueType] ?? 'neutral'}>{ticket.issueType}</Badge>
            ) : null}
            {ticket.priority ? (
              <span className="text-caption text-fg-subtle">{ticket.priority}</span>
            ) : null}
          </div>
          <p className="mt-1 text-footnote text-fg">{ticket.summary}</p>
        </div>

        <Button variant="ghost" size="icon-sm" aria-label="Cerrar detalle" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border px-5 py-2 md:grid-cols-4">
        {[
          { label: 'Reporter', value: ticket.reporter },
          { label: 'Asignado', value: ticket.assignee },
          { label: 'Creado', value: formatDate(ticket.created) },
          { label: 'Actualizado', value: formatDate(ticket.updated) },
        ].map((item) => (
          <div key={item.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
              {item.label}
            </p>
            <p className="text-caption text-fg-muted">{item.value ?? '—'}</p>
          </div>
        ))}
      </div>

      {ticket.parent ? (
        <p className="border-t border-border px-5 py-1.5 text-caption text-fg-subtle">
          Épica: <span className="text-brand">{ticket.parent}</span>
        </p>
      ) : null}

      {comments.length > 0 ? (
        <div className="border-t border-border">
          <p className="px-5 py-1.5 text-caption font-semibold uppercase tracking-wide text-fg-subtle">
            Comentarios ({comments.length})
            {mentionCount > 0 ? ` · ${mentionCount} menciones` : ''}
          </p>
          <ul className="scrollbar-apple max-h-56 overflow-y-auto">
            {comments.map((comment, index) => (
              <li
                key={`${comment.created}-${index}`}
                className={cn(
                  'border-b border-border px-5 py-2',
                  comment.isMention && 'border-l-2 border-l-brand bg-brand-soft',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'text-caption font-semibold',
                      comment.isMention ? 'text-brand' : 'text-fg-muted',
                    )}
                  >
                    {comment.author ?? '—'}
                    {comment.isMention ? ' 🔖' : ''}
                  </span>
                  <span className="text-caption text-fg-subtle">{formatDate(comment.created)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-footnote text-fg">
                  {comment.body ?? ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex gap-2 border-t border-border px-5 py-2">
        <Button variant="primary" size="sm" asChild>
          <a href={jiraIssueUrl(ticket.key)} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            Abrir en Jira
          </a>
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onCopy(ticket.key)}>
          <Copy />
          Copiar clave
        </Button>
      </div>
    </section>
  );
}
