import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Eye, RefreshCw, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DataTable } from '@/components/ui/data-table';
import { DatePicker } from '@/components/ui/date-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/client';
import { JiraSetupState, getJiraErrorCode } from '@/features/jira/components/jira-setup-state';
import type { JiraTrackingItem } from '@/lib/api/types';
import { formatDate } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { JiraTicketDrawer } from './components/jira-ticket-drawer';
import { useJiraTracking } from './use-jira-tracking';
import { jiraTrackingOrigin, jiraTrackingOriginHref } from './lib/origin';
import { useJiraTicketContext } from '@/features/jira-tickets/use-create-jira-ticket';

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
  const { data: jiraContext } = useJiraTicketContext(projectId, tracking.length > 0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<JiraTrackingItem | null>(null);
  const [spaceFilter, setSpaceFilter] = useState('');
  const [keyFilter, setKeyFilter] = useState('');
  const [epicFilter, setEpicFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // El drawer guarda una copia del ticket: al refrescar el tracking tras
  // cambiar el estado local, se sincroniza la selección abierta.
  useEffect(() => {
    if (!selected) return;
    const next = tracking.find(
      (item) => item.id === selected.id && item.origin === selected.origin,
    );
    if (next && (next !== selected)) setSelected(next);
  }, [tracking, selected]);

  const filtersActive = Boolean(
    spaceFilter || keyFilter.trim() || epicFilter || statusFilter || fromDate || toDate,
  );

  const filtered = useMemo(() => {
    const term = keyFilter.trim().toLowerCase();
    return tracking
      .filter((item) => {
        if (spaceFilter && item.jira_space_key !== spaceFilter) return false;
        if (term) {
          const haystack = [
            item.jira_key,
            item.tc_key,
            item.origin_tc_key,
            `#${item.id}`,
            item.title,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        if (epicFilter && item.jira_epic_key !== epicFilter) return false;
        if (statusFilter && item.jira_status !== statusFilter) return false;

        const day = item.created_at
          ? new Date(item.created_at).toLocaleDateString('en-CA', {
              timeZone: 'America/Argentina/Buenos_Aires',
            })
          : '';
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
  }, [tracking, spaceFilter, keyFilter, epicFilter, statusFilter, fromDate, toDate]);

  const spaceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of tracking) {
      const key = item.jira_space_key ?? '';
      if (!key || key === '—') continue;
      map.set(key, item.jira_space_name && item.jira_space_name !== '—' ? item.jira_space_name : key);
    }
    return [
      { value: '', label: 'Todos los espacios' },
      ...[...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, label]) => ({ value, label: `${value} · ${label}` })),
    ];
  }, [tracking]);

  const epicOptions = useMemo(() => {
    const map = new Map<string, string>();
    // Primero las épicas del proyecto en Jira (aunque todavía no tengan
    // tickets vinculados), así el filtro muestra todas.
    for (const epic of jiraContext?.epics ?? []) {
      map.set(epic.key, epic.summary || epic.name || epic.key);
    }
    for (const item of tracking) {
      map.set(item.jira_epic_key, item.jira_epic_name);
    }
    return [
      { value: '', label: 'Todas las épicas' },
      ...[...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, label]) => ({ value, label: `${value} — ${label}` })),
    ];
  }, [tracking, jiraContext]);

  const statusOptions = useMemo(() => {
    const values = [...new Set(tracking.map((item) => item.jira_status))].sort((a, b) =>
      a.localeCompare(b),
    );
    return [
      { value: '', label: 'Todos los estados' },
      ...values.map((value) => ({ value, label: value })),
    ];
  }, [tracking]);

  const clearFilters = () => {
    setSpaceFilter('');
    setKeyFilter('');
    setEpicFilter('');
    setStatusFilter('');
    setFromDate('');
    setToDate('');
  };

  const groups = useMemo<EpicGroup[]>(() => {
    const map = new Map<string, EpicGroup>();

    for (const item of filtered) {
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

    // `filtered` viene ordenado de más nuevo a más viejo: el orden de
    // inserción de las épicas refleja la actividad más reciente.
    return [...map.values()];
  }, [filtered]);

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
          {filtersActive
            ? `${filtered.length} de ${tracking.length} tickets`
            : `${tracking.length} ${tracking.length === 1 ? 'ticket' : 'tickets'} sincronizados`}
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

      {tracking.length > 0 ? (
        <div className="shrink-0 border-b border-border bg-surface px-5 py-2">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Espacio" htmlFor="tracking-space" className="w-44">
              <Combobox
                id="tracking-space"
                value={spaceFilter}
                onValueChange={setSpaceFilter}
                options={spaceOptions}
                placeholder="Todos los espacios"
                aria-label="Filtrar por espacio"
              />
            </Field>

            <Field label="Key / TC / #" htmlFor="tracking-key" className="w-40">
              <Input
                id="tracking-key"
                value={keyFilter}
                onChange={(event) => setKeyFilter(event.target.value)}
                placeholder="AGIP-1234, TC-395, #521"
                className="h-9"
              />
            </Field>

            <Field label="Épica" htmlFor="tracking-epic" className="w-64">
              <Combobox
                id="tracking-epic"
                value={epicFilter}
                onValueChange={setEpicFilter}
                options={epicOptions}
                placeholder="Todas las épicas"
                searchPlaceholder="Buscar épica…"
                aria-label="Filtrar por épica"
              />
            </Field>

            <Field label="Estado" htmlFor="tracking-status" className="w-40">
              <Combobox
                id="tracking-status"
                value={statusFilter}
                onValueChange={setStatusFilter}
                options={statusOptions}
                placeholder="Todos los estados"
                searchPlaceholder="Buscar estado…"
                aria-label="Filtrar por estado"
              />
            </Field>

            <Field label="Desde" htmlFor="tracking-from" className="w-40">
              <DatePicker
                id="tracking-from"
                value={fromDate}
                max={toDate || undefined}
                onChange={setFromDate}
                aria-label="Fecha desde"
              />
            </Field>

            <Field label="Hasta" htmlFor="tracking-to" className="w-40">
              <DatePicker
                id="tracking-to"
                value={toDate}
                min={fromDate || undefined}
                onChange={setToDate}
                aria-label="Fecha hasta"
              />
            </Field>

            <Button
              variant="ghost"
              size="sm"
              className="mb-0.5"
              onClick={clearFilters}
              disabled={!filtersActive}
            >
              Limpiar filtros
            </Button>
          </div>
        </div>
      ) : null}

      <div className="scrollbar-apple min-h-0 flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : errorMessage ? (
          <JiraSetupState
            projectId={projectId}
            code={getJiraErrorCode(error)}
            message={errorMessage}
            icon={<Target />}
          />
        ) : tracking.length === 0 ? (
          <EmptyState
            icon={<Target />}
            title="Sin tickets vinculados"
            description="Los bugs y hallazgos que exportes a Jira aparecen acá con su TC y número de origen."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Target />}
            title="Sin tickets para los filtros"
            description="Probá con otro espacio, key, épica, estado o rango de fechas."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={[
              {
                id: 'ticket',
                header: 'Épica / Ticket',
                cellClassName: 'pl-10',
                cell: (ticket) => (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-caption font-bold text-brand">
                      {ticket.jira_key}
                    </span>
                    <span className="text-footnote font-medium text-fg">{ticket.title}</span>
                  </div>
                ),
              },
              {
                id: 'origin',
                header: 'Origen / TC',
                headerClassName: 'w-64',
                cell: (ticket) => {
                  const origin = jiraTrackingOrigin(ticket);
                  const href = jiraTrackingOriginHref(ticket);
                  return (
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5">
                        <Badge tone={origin.isHallazgo ? 'brand' : 'warn'}>
                          {origin.isHallazgo ? 'HALLAZGO' : 'BUG'}
                        </Badge>
                        {href ? (
                          <Link
                            to={href}
                            className="text-caption font-semibold text-brand hover:underline"
                          >
                            {origin.label}
                          </Link>
                        ) : (
                          <span className="text-caption font-semibold text-fg-muted">
                            {origin.label}
                          </span>
                        )}
                      </span>
                      <span
                        className="truncate text-caption text-fg-subtle"
                        title={origin.tcTitle ?? undefined}
                      >
                        {origin.tcKey
                          ? `${origin.tcKey}${origin.tcTitle ? ` · ${origin.tcTitle}` : ''}`
                          : 'Sin TC asociado'}
                      </span>
                    </div>
                  );
                },
              },
              {
                id: 'assignee',
                header: 'Asignado',
                headerClassName: 'w-48',
                cell: (ticket) => (
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
                ),
              },
              {
                id: 'created',
                header: 'Creación',
                headerClassName: 'w-32',
                cellClassName: 'text-caption text-fg-subtle',
                cell: (ticket) => formatDate(ticket.created_at),
              },
              {
                id: 'status',
                header: 'Estado Jira',
                align: 'center',
                headerClassName: 'w-36',
                cell: (ticket) => (
                  <Badge tone={STATUS_TONE(ticket.jira_status)}>{ticket.jira_status}</Badge>
                ),
              },
              {
                id: 'actions',
                header: 'Acciones',
                align: 'right',
                headerClassName: 'w-32',
                cell: (ticket) => (
                  <Button variant="ghost" size="sm" onClick={() => setSelected(ticket)}>
                    <Eye />
                    Ver detalle
                  </Button>
                ),
              },
            ]}
            groups={groups.map((group) => {
              const isOpen = !collapsed.has(group.key);

              return {
                id: group.key,
                header: (
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
                      ({group.tickets.length} {group.tickets.length === 1 ? 'ticket' : 'tickets'})
                    </span>
                  </div>
                ),
                rows: isOpen ? group.tickets : [],
              };
            })}
            getRowId={(ticket) => ticket.id}
            onGroupClick={toggle}
            rowClassName={() => 'border-l-brand'}
          />
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
