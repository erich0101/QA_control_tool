import { useMemo, useState } from 'react';
import { ChevronRight, Eye, RefreshCw, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/client';
import type { JiraTrackingItem } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { JiraTicketDrawer } from './components/jira-ticket-drawer';
import { useJiraTracking } from './use-jira-tracking';

const STATUS_TONE = (status: string): 'ok' | 'warn' | 'brand' | 'neutral' => {
  const value = status.toUpperCase();
  if (value.includes('DONE') || value.includes('FIXED') || value.includes('CERRADO')) return 'ok';
  if (value.includes('PROGRESS') || value.includes('DOING') || value.includes('PROGRESO')) return 'brand';
  if (value.includes('TODO') || value.includes('PENDING') || value.includes('BACKLOG')) return 'neutral';
  return 'warn';
};

interface EpicGroup {
  key: string;
  name: string;
  tickets: JiraTrackingItem[];
}

export function JiraTrackingPage() {
  const projectId = useUiStore((s) => s.activeProjectId);
  const { data: tracking = [], isLoading, isFetching, refetch, error } = useJiraTracking(projectId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<JiraTrackingItem | null>(null);

  const groups = useMemo<EpicGroup[]>(() => {
    const map = new Map<string, EpicGroup>();

    for (const item of tracking) {
      const key = item.jira_epic_key || 'Otras';
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: item.jira_epic_name || 'Tickets sin épica',
          tickets: [],
        });
      }
      map.get(key)!.tickets.push(item);
    }

    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [tracking]);

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const errorMessage =
    error instanceof ApiError
      ? error.message
      : error
        ? 'No se pudo sincronizar con Jira.'
        : null;

  if (!projectId) {
    return (
      <div className="mx-auto max-w-xl p-10">
        <EmptyState
          icon={<Target />}
          title="Seleccioná un proyecto"
          description="Usá el selector de la barra superior para ver el seguimiento."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface px-5 py-2.5">
        <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
          Seguimiento Jira
        </span>
        <Badge tone="neutral">
          {tracking.length} {tracking.length === 1 ? 'ticket' : 'tickets'} sincronizados
        </Badge>
        <Badge tone="brand">
          {groups.length} {groups.length === 1 ? 'épica' : 'épicas'}
        </Badge>

        <div className="flex-1" />

        <Button variant="ghost" size="sm" loading={isFetching} onClick={() => refetch()}>
          <RefreshCw />
          Sincronizar con Jira
        </Button>
      </header>

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : errorMessage ? (
          <EmptyState icon={<Target />} title="No se pudo consultar Jira" description={errorMessage} />
        ) : tracking.length === 0 ? (
          <EmptyState
            icon={<Target />}
            title="Sin tickets vinculados"
            description="Los bugs que exportes a Jira aparecen acá para seguimiento."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full border-collapse text-footnote">
              <thead>
                <tr className="border-b border-border bg-fill-soft text-caption uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-2 text-left font-semibold">Épica / Ticket</th>
                  <th className="w-48 px-4 py-2 text-left font-semibold">Asignado</th>
                  <th className="w-32 px-4 py-2 text-left font-semibold">Creación</th>
                  <th className="w-36 px-4 py-2 text-center font-semibold">Estado Jira</th>
                  <th className="w-32 px-4 py-2 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const isOpen = !collapsed.has(group.key);

                  return [
                    <tr
                      key={`epic-${group.key}`}
                      onClick={() => toggle(group.key)}
                      className="cursor-pointer border-b border-border bg-surface-2 hover:bg-fill-soft"
                    >
                      <td colSpan={5} className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={`size-3.5 text-fg-subtle transition-transform ${
                              isOpen ? 'rotate-90' : ''
                            }`}
                          />
                          <Badge tone="brand" className="uppercase">
                            Épica
                          </Badge>
                          <span className="font-semibold text-fg">
                            {group.key} — {group.name}
                          </span>
                          <span className="text-caption text-fg-subtle">
                            ({group.tickets.length}{' '}
                            {group.tickets.length === 1 ? 'ticket' : 'tickets'})
                          </span>
                        </div>
                      </td>
                    </tr>,

                    ...(isOpen
                      ? group.tickets.map((ticket) => (
                          <tr
                            key={ticket.id}
                            className="border-b border-l-[3px] border-border border-l-brand hover:bg-fill-soft"
                          >
                            <td className="px-4 py-2 pl-10">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono text-caption font-bold text-brand">
                                  {ticket.jira_key}
                                </span>
                                <span className="text-footnote font-medium text-fg">
                                  {ticket.title}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-2">
                              <span className="flex items-center gap-2">
                                {ticket.jira_avatar ? (
                                  <img
                                    src={ticket.jira_avatar}
                                    alt=""
                                    className="size-6 rounded-full border border-border"
                                  />
                                ) : (
                                  <span className="flex size-6 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                                    {(ticket.jira_assignee ?? '?').charAt(0).toUpperCase()}
                                  </span>
                                )}
                                <span className="truncate text-caption text-fg-muted">
                                  {ticket.jira_assignee}
                                </span>
                              </span>
                            </td>

                            <td className="px-4 py-2 text-caption text-fg-subtle">
                              {formatDate(ticket.created_at)}
                            </td>

                            <td className="px-4 py-2 text-center">
                              <Badge tone={STATUS_TONE(ticket.jira_status)}>
                                {ticket.jira_status}
                              </Badge>
                            </td>

                            <td className="px-4 py-2 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelected(ticket);
                                }}
                              >
                                <Eye />
                                Ver detalle
                              </Button>
                            </td>
                          </tr>
                        ))
                      : []),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected ? (
        <JiraTicketDrawer
          ticket={selected}
          projectId={projectId}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
