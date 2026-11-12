import { useEffect, useMemo, useState } from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import type { JiraTicketPayload } from '@/lib/api/jira';
import {
  useCreateJiraTicket,
  useJiraTicketContext,
  type JiraTicketKind,
} from './use-create-jira-ticket';

export interface JiraTicketItem {
  id: number;
  title: string;
  /** Severidad local; se usa para preseleccionar la prioridad de Jira. */
  severity?: string | null;
  jira_key?: string | null;
}

interface JiraTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
  kind: JiraTicketKind;
  items: JiraTicketItem[];
}

type Result = { id: number; title: string; ok: boolean; key?: string; error?: string };

const NO_EPIC = '__none__';
const NO_ASSIGNEE = '__none__';

/** Severidad local → nombre de prioridad de Jira (igual que la UI legacy). */
const SEVERITY_TO_PRIORITY: Record<string, string> = {
  Crítica: 'Highest',
  Alta: 'High',
  Media: 'Medium',
  Baja: 'Low',
};

function defaultPriorityId(
  priorities: Array<{ id: string; name: string }>,
  severity?: string | null,
) {
  const target = SEVERITY_TO_PRIORITY[severity ?? 'Media'] ?? 'Medium';
  return (
    priorities.find((p) => p.name === target)?.id ??
    priorities.find((p) => p.name === 'Medium')?.id ??
    priorities[0]?.id ??
    ''
  );
}

/**
 * Creación de tickets en Jira (uno o varios bugs/hallazgos).
 * Replica el flujo legacy: épica y asignado se aplican a todos, la prioridad
 * se ajusta por ítem y los campos obligatorios de Jira se completan una vez.
 */
export function JiraTicketDialog({
  open,
  onOpenChange,
  projectId,
  kind,
  items,
}: JiraTicketDialogProps) {
  const pending = useMemo(() => items.filter((item) => !item.jira_key), [items]);
  const context = useJiraTicketContext(projectId, open);
  const createTicket = useCreateJiraTicket(projectId, kind);

  const [epicId, setEpicId] = useState(NO_EPIC);
  const [assigneeId, setAssigneeId] = useState(NO_ASSIGNEE);
  const [priorityByItem, setPriorityByItem] = useState<Record<number, string>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [started, setStarted] = useState(false);

  const priorities = context.data?.priorities ?? [];
  const customFields = context.data?.customFields ?? [];
  const finished = started && !creating;

  useEffect(() => {
    if (!open) return;
    setEpicId(NO_EPIC);
    setAssigneeId(NO_ASSIGNEE);
    setCustomValues({});
    setResults([]);
    setStarted(false);
  }, [open]);

  // Prioridad inicial por severidad cuando llega el contexto.
  // Se depende de los ids (string estable), no del array, para no re-renderizar
  // en loop cuando el padre recrea `items` en cada render.
  const pendingKey = pending.map((item) => item.id).join(',');
  useEffect(() => {
    if (!open || priorities.length === 0) return;
    setPriorityByItem((current) => {
      let changed = false;
      const next = { ...current };
      for (const item of pending) {
        if (!next[item.id]) {
          next[item.id] = defaultPriorityId(priorities, item.severity);
          changed = true;
        }
      }
      return changed ? next : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, priorities, pendingKey]);

  const missingRequired = customFields.filter(
    (field) => field.required && !customValues[field.fieldId]?.trim(),
  );

  const onCreate = async () => {
    if (pending.length === 0) return;
    if (missingRequired.length > 0) {
      toast.error(`Completá: ${missingRequired.map((field) => field.name).join(', ')}`);
      return;
    }

    const shared: JiraTicketPayload = {
      epicId: epicId === NO_EPIC ? null : epicId,
      assigneeId: assigneeId === NO_ASSIGNEE ? null : assigneeId,
      customFields: Object.fromEntries(
        Object.entries(customValues).filter(([, value]) => value.trim() !== ''),
      ),
    };

    setStarted(true);
    setCreating(true);
    const collected: Result[] = [];

    for (const item of pending) {
      try {
        const result = await createTicket.mutateAsync({
          id: item.id,
          payload: { ...shared, priorityId: priorityByItem[item.id] || null },
        });
        collected.push({ id: item.id, title: item.title, ok: true, key: result.jira.key });
      } catch (error) {
        collected.push({
          id: item.id,
          title: item.title,
          ok: false,
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
      setResults([...collected]);
    }

    setCreating(false);
  };

  const created = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const contextError =
    context.error instanceof Error ? context.error.message : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !creating && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Crear {pending.length === 1 ? 'ticket' : `${pending.length} tickets`} en Jira
          </DialogTitle>
          <DialogDescription>
            Épica y asignado se aplican a todos; la prioridad se ajusta por{' '}
            {kind === 'defect' ? 'bug' : 'hallazgo'} según su severidad.
          </DialogDescription>
        </DialogHeader>

        {context.isLoading ? (
          <div className="flex items-center gap-2 px-1 py-6 text-footnote text-fg-subtle">
            <Loader2 className="size-4 animate-spin" />
            Cargando configuración de Jira…
          </div>
        ) : contextError ? (
          <div className="rounded-md border border-fail/30 bg-fail-soft px-3 py-2.5 text-footnote text-fail">
            {contextError}. Revisá tu token de Jira en el menú de usuario.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Épica</Label>
                <SelectField
                  value={epicId}
                  onValueChange={setEpicId}
                  aria-label="Épica de Jira"
                  options={[
                    { value: NO_EPIC, label: 'Sin épica' },
                    ...(context.data?.epics ?? []).map((epic) => ({
                      value: epic.id,
                      label: `${epic.key} · ${epic.summary}`,
                    })),
                  ]}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Asignado a</Label>
                <SelectField
                  value={assigneeId}
                  onValueChange={setAssigneeId}
                  aria-label="Asignado en Jira"
                  options={[
                    { value: NO_ASSIGNEE, label: 'Sin asignar' },
                    ...(context.data?.users ?? []).map((user) => ({
                      value: user.accountId,
                      label: user.displayName,
                    })),
                  ]}
                />
              </div>
            </div>

            {customFields.length > 0 ? (
              <div className="space-y-2 rounded-md border border-border bg-surface-2 p-3">
                <p className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">
                  Campos obligatorios de Jira
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {customFields.map((field) => (
                    <div key={field.fieldId} className="space-y-1.5">
                      <Label>
                        {field.name}
                        {field.required ? ' *' : ''}
                      </Label>
                      {field.options && field.options.length > 0 ? (
                        <SelectField
                          value={customValues[field.fieldId] ?? ''}
                          placeholder="Seleccionar…"
                          aria-label={field.name}
                          onValueChange={(value) =>
                            setCustomValues((current) => ({ ...current, [field.fieldId]: value }))
                          }
                          options={field.options.map((option) => ({
                            value: option.id,
                            label: option.name,
                          }))}
                        />
                      ) : (
                        <Input
                          value={customValues[field.fieldId] ?? ''}
                          onChange={(event) =>
                            setCustomValues((current) => ({
                              ...current,
                              [field.fieldId]: event.target.value,
                            }))
                          }
                          placeholder="Valor…"
                          aria-label={field.name}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-border">
              <div className="border-b border-border bg-surface-2 px-3 py-2 text-caption font-semibold uppercase tracking-wide text-fg-subtle">
                {kind === 'defect' ? 'Bugs' : 'Hallazgos'} a procesar ({pending.length})
              </div>
              <ul className="scrollbar-apple max-h-56 divide-y divide-border overflow-y-auto">
                {pending.map((item) => {
                  const result = results.find((r) => r.id === item.id);
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2 text-footnote"
                    >
                      <span className="w-12 shrink-0 font-mono text-caption text-fg-subtle">
                        #{item.id}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-fg">{item.title}</span>
                      <Badge
                        tone={
                          item.severity === 'Crítica' || item.severity === 'Alta'
                            ? 'fail'
                            : item.severity === 'Baja'
                              ? 'ok'
                              : 'warn'
                        }
                      >
                        {item.severity ?? 'Media'}
                      </Badge>
                      {result ? (
                        result.ok ? (
                          <span className="text-caption font-semibold text-ok">{result.key}</span>
                        ) : (
                          <span className="max-w-40 truncate text-caption text-fail" title={result.error}>
                            {result.error}
                          </span>
                        )
                      ) : (
                        <div className="w-32 shrink-0">
                          <SelectField
                            value={priorityByItem[item.id] ?? ''}
                            onValueChange={(value) =>
                              setPriorityByItem((current) => ({ ...current, [item.id]: value }))
                            }
                            aria-label={`Prioridad de #${item.id}`}
                            disabled={creating}
                            options={priorities.map((priority) => ({
                              value: priority.id,
                              label: priority.name,
                            }))}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {results.length > 0 && finished ? (
              <div
                className={`rounded-md border px-3 py-2 text-footnote ${
                  failed === 0
                    ? 'border-ok/30 bg-ok-soft text-ok'
                    : 'border-warn/30 bg-warn-soft text-warn'
                }`}
              >
                {created > 0 ? `${created} ticket${created === 1 ? '' : 's'} creado${created === 1 ? '' : 's'} en Jira.` : ''}{' '}
                {failed > 0 ? `${failed} con error.` : ''}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {contextError ? (
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          ) : finished ? (
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={onCreate}
                loading={creating}
                disabled={context.isLoading || pending.length === 0}
              >
                <Rocket />
                {pending.length === 1 ? 'Crear ticket' : 'Iniciar creación'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
