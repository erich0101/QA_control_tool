import { useEffect, useState } from 'react';
import { Bug, Rocket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { JiraTicketDialog } from '@/features/jira-tickets/jira-ticket-dialog';
import type { TestRun } from '@/lib/api/types';
import { useUiStore } from '@/stores/ui';
import { useRunBugs } from '../use-history';

interface RunBugsDialogProps {
  run: TestRun | null;
  onOpenChange: (open: boolean) => void;
}

export function RunBugsDialog({ run, onOpenChange }: RunBugsDialogProps) {
  const projectId = useUiStore((s) => s.activeProjectId);
  const { data: bugs = [], isLoading } = useRunBugs(run?.id ?? null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [jiraOpen, setJiraOpen] = useState(false);

  // Cada ciclo arranca sin selección.
  useEffect(() => {
    setSelected(new Set());
    setJiraOpen(false);
  }, [run?.id]);

  const exportable = bugs.filter((bug) => !bug.jira_key && bug.status !== 'DISMISSED');
  const allSelected = exportable.length > 0 && exportable.every((bug) => selected.has(bug.id));

  const toggle = (id: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(exportable.map((bug) => bug.id)));
  };

  return (
    <>
      <Dialog open={run !== null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Defectos del ciclo #{run?.id}</DialogTitle>
            <DialogDescription>{run?.suite_title}</DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : bugs.length === 0 ? (
            <EmptyState icon={<Bug />} title="Sin defectos" description="Este ciclo no reportó bugs." />
          ) : (
            <>
              {exportable.length > 0 ? (
                <div className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-footnote text-fg-muted">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                    Seleccionar todos ({exportable.length} exportables)
                  </label>
                  <p className="text-caption text-fg-subtle">
                    {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
                  </p>
                </div>
              ) : null}

              <ul className="scrollbar-apple max-h-96 space-y-1.5 overflow-y-auto">
                {bugs.map((bug) => {
                  const canExport = !bug.jira_key && bug.status !== 'DISMISSED';
                  return (
                    <li
                      key={bug.id}
                      className="flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-brand"
                        aria-label={`Seleccionar #${bug.id}`}
                        checked={selected.has(bug.id)}
                        disabled={!canExport}
                        title={
                          bug.jira_key
                            ? 'Ya exportado a Jira'
                            : bug.status === 'DISMISSED'
                              ? 'El bug está descartado'
                              : 'Exportar a Jira'
                        }
                        onChange={() => toggle(bug.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-footnote font-medium text-fg">{bug.title}</p>
                          <Badge
                            tone={
                              bug.severity === 'Crítica' || bug.severity === 'Alta'
                                ? 'fail'
                                : bug.severity === 'Baja'
                                  ? 'ok'
                                  : 'warn'
                            }
                          >
                            {bug.severity ?? 'Media'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-caption text-fg-subtle">
                          {bug.tc_title ? `${bug.tc_title} · ` : ''}
                          {bug.status ?? 'OPEN'}
                          {bug.jira_key ? ` · ${bug.jira_key}` : ''}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button
              variant="primary"
              disabled={selected.size === 0}
              onClick={() => setJiraOpen(true)}
            >
              <Rocket />
              Crear {selected.size === 1 ? 'ticket' : 'tickets'} en Jira
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <JiraTicketDialog
        open={jiraOpen}
        onOpenChange={setJiraOpen}
        projectId={projectId}
        kind="defect"
        items={bugs
          .filter((bug) => selected.has(bug.id))
          .map((bug) => ({
            id: bug.id,
            title: bug.title ?? 'Sin título',
            severity: bug.severity,
            jira_key: bug.jira_key,
          }))}
      />
    </>
  );
}
