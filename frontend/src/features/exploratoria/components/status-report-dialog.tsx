import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { DatePicker } from '@/components/ui/date-picker';
import { Combobox } from '@/components/ui/combobox';
import { Skeleton } from '@/components/ui/skeleton';
import { exploratoriaApi } from '@/lib/api/exploratoria';
import { cn } from '@/lib/utils';
import { useStatusReportSessions, useStatusReportTesters } from '../use-exploratoria';

interface StatusReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
}

const toInputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const today = () => toInputDate(new Date());

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toInputDate(date);
};

type Tester = { id: number | null; name: string; count: number };

const testerKey = (tester: Tester) =>
  tester.id ? `id:${tester.id}` : `name:${tester.name.toLowerCase()}`;

/**
 * Reporte de estatus de Exploratoria: todo lo realizado (tests, defectos,
 * hallazgos y evidencias disponibles) en un rango de fechas, para todos los
 * testers o uno en particular.
 */
export function StatusReportDialog({ open, onOpenChange, projectId }: StatusReportDialogProps) {
  const [dateFrom, setDateFrom] = useState(daysAgo(7));
  const [dateTo, setDateTo] = useState(today());
  const [selectedSession, setSelectedSession] = useState('all');
  const [selected, setSelected] = useState('all');

  useEffect(() => {
    if (!open) return;
    setDateFrom(daysAgo(7));
    setDateTo(today());
    setSelectedSession('all');
    setSelected('all');
  }, [open]);

  const { data, isLoading, error } = useStatusReportTesters(projectId, dateFrom, dateTo, open);
  const testers = useMemo(() => data?.testers ?? [], [data]);

  const {
    data: sessionData,
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useStatusReportSessions(projectId, open);
  const sessions = useMemo(() => sessionData ?? [], [sessionData]);

  // Si la sesión elegida desapareciera de la lista, se vuelve a "Todas".
  useEffect(() => {
    if (selectedSession === 'all') return;
    if (!sessions.some((session) => `id:${session.id}` === selectedSession)) {
      setSelectedSession('all');
    }
  }, [sessions, selectedSession]);

  // Si el tester elegido dejó de tener actividad en el rango, se vuelve a "Todos".
  useEffect(() => {
    if (selected === 'all') return;
    if (!testers.some((tester) => testerKey(tester) === selected)) setSelected('all');
  }, [testers, selected]);

  const sessionOptions = useMemo(
    () => [
      {
        value: 'all',
        label: 'Todas las sesiones',
        description: 'Consolidado del rango (comportamiento actual)',
      },
      ...sessions.map((session) => ({
        value: `id:${session.id}`,
        label: `#${session.id} · ${session.name || 'Sesión sin nombre'}`,
        description: `${session.status === 'RUNNING' ? 'En curso' : 'Finalizada'} · ${session.tester_name} · ${session.executions} test(s) · ${session.hallazgos} hallazgo(s)`,
      })),
    ],
    [sessions],
  );

  const invalidRange = !dateFrom || !dateTo || dateFrom > dateTo;

  const generate = () => {
    if (!projectId || invalidRange) return;
    const tester = testers.find((option) => testerKey(option) === selected);
    const runId = selectedSession === 'all' ? null : Number(selectedSession.replace('id:', ''));
    const url = exploratoriaApi.statusReportUrl(projectId, {
      dateFrom,
      dateTo,
      runId,
      testerId: tester?.id ?? null,
      tester: tester?.name ?? null,
    });
    window.open(url, '_blank', 'noopener');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reporte de estatus</DialogTitle>
          <DialogDescription>
            Todo lo realizado en Exploratoria en el rango: tests ejecutados, defectos y hallazgos.
            Elegí el rango y, si querés, un tester en particular. Los defectos marcados como
            resueltos (FIXED/CLOSED) no cuentan como abiertos en el estado de entrega.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Desde" htmlFor="status-report-from">
            <DatePicker
              id="status-report-from"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={setDateFrom}
            />
          </Field>
          <Field label="Hasta" htmlFor="status-report-to">
            <DatePicker
              id="status-report-to"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={setDateTo}
            />
          </Field>
        </div>

        {invalidRange ? (
          <p className="text-caption text-fail">El rango de fechas es inválido.</p>
        ) : null}

        <div className="space-y-2">
          <p className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">
            Sesión
          </p>

          {sessionsLoading ? (
            <Skeleton className="h-9" />
          ) : sessionsError ? (
            <p className="text-caption text-fail">
              No se pudieron cargar las sesiones: {(sessionsError as Error).message}
            </p>
          ) : (
            <Combobox
              options={sessionOptions}
              value={selectedSession}
              onValueChange={setSelectedSession}
              placeholder="Todas las sesiones"
              searchPlaceholder="Buscar sesión…"
              emptyText="Sin sesiones exploratorias"
              aria-label="Sesión del reporte"
            />
          )}
          <p className="text-caption text-fg-subtle">
            Elegí una sesión puntual o “Todas las sesiones” para el consolidado del rango.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">
            Tester
          </p>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : error ? (
            <p className="text-caption text-fail">
              No se pudieron cargar los testers: {error.message}
            </p>
          ) : (
            <>
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-footnote transition-colors',
                  selected === 'all'
                    ? 'border-brand bg-brand-soft text-fg'
                    : 'border-border hover:bg-fill-soft',
                )}
              >
                <input
                  type="radio"
                  name="status-report-tester"
                  value="all"
                  checked={selected === 'all'}
                  onChange={() => setSelected('all')}
                  className="accent-brand"
                />
                <span className="flex-1 font-medium">Todos los testers</span>
              </label>

              {testers.map((tester) => (
                <label
                  key={testerKey(tester)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-footnote transition-colors',
                    selected === testerKey(tester)
                      ? 'border-brand bg-brand-soft text-fg'
                      : 'border-border hover:bg-fill-soft',
                  )}
                >
                  <input
                    type="radio"
                    name="status-report-tester"
                    value={testerKey(tester)}
                    checked={selected === testerKey(tester)}
                    onChange={() => setSelected(testerKey(tester))}
                    className="accent-brand"
                  />
                  <span className="flex-1 truncate">{tester.name}</span>
                  <span className="text-caption text-fg-subtle">{tester.count}</span>
                </label>
              ))}

              {testers.length === 0 ? (
                <p className="text-caption text-fg-subtle">
                  Sin actividad en el rango: el reporte se generará vacío.
                </p>
              ) : null}
            </>
          )}
        </div>

        <p className="text-caption text-fg-subtle">
          Los filtros de sesión y tester se combinan. Se informan dos aceptaciones:{' '}
          <strong>evaluada</strong> (OK / OK+FAIL+WARNING, calidad de
          lo probado) y <strong>total</strong> (OK / total de TC, donde pendientes, BLOCK y SKIP
          cuentan como no aceptados). Las evidencias se incluyen sólo si están disponibles en esta
          máquina (o en la copia de Postgres); las ausentes se omiten sin bloquear el reporte.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={generate} disabled={invalidRange}>
            <FileText />
            Generar reporte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
