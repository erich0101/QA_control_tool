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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { exploratoriaApi } from '@/lib/api/exploratoria';
import { cn } from '@/lib/utils';
import { useStatusReportTesters } from '../use-exploratoria';

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
  const [selected, setSelected] = useState('all');

  useEffect(() => {
    if (!open) return;
    setDateFrom(daysAgo(7));
    setDateTo(today());
    setSelected('all');
  }, [open]);

  const { data, isLoading, error } = useStatusReportTesters(projectId, dateFrom, dateTo, open);
  const testers = useMemo(() => data?.testers ?? [], [data]);

  // Si el tester elegido dejó de tener actividad en el rango, se vuelve a "Todos".
  useEffect(() => {
    if (selected === 'all') return;
    if (!testers.some((tester) => testerKey(tester) === selected)) setSelected('all');
  }, [testers, selected]);

  const invalidRange = !dateFrom || !dateTo || dateFrom > dateTo;

  const generate = () => {
    if (!projectId || invalidRange) return;
    const tester = testers.find((option) => testerKey(option) === selected);
    const url = exploratoriaApi.statusReportUrl(projectId, {
      dateFrom,
      dateTo,
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
            Elegí el rango y, si querés, un tester en particular.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Desde" htmlFor="status-report-from">
            <Input
              id="status-report-from"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </Field>
          <Field label="Hasta" htmlFor="status-report-to">
            <Input
              id="status-report-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </Field>
        </div>

        {invalidRange ? (
          <p className="text-caption text-fail">El rango de fechas es inválido.</p>
        ) : null}

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
          Las evidencias se incluyen sólo si están disponibles en esta máquina (o en la copia de
          Postgres); las ausentes se omiten sin bloquear el reporte.
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
