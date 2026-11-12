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
import { exploratoriaApi } from '@/lib/api/exploratoria';
import type { ExploratoryExecution } from '@/lib/api/types';
import { cn } from '@/lib/utils';

interface BugsReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: number;
  runName?: string | null;
  executions: ExploratoryExecution[];
}

const ISSUE_STATUSES = new Set(['FAIL', 'WARNING', 'BLOCK']);

interface TesterOption {
  key: string;
  id: number | null;
  name: string;
  count: number;
}

/**
 * Reporte de bugs de una sesión exploratoria.
 * Permite elegir entre todos los testers o uno en particular antes de abrir
 * el HTML. Las evidencias se incluyen solo si están disponibles (local o en
 * PG); las ausentes se omiten para que el reporte siempre se genere.
 */
export function BugsReportDialog({
  open,
  onOpenChange,
  runId,
  runName,
  executions,
}: BugsReportDialogProps) {
  const [selected, setSelected] = useState('all');

  useEffect(() => {
    if (open) setSelected('all');
  }, [open]);

  const { testers, issueCount } = useMemo(() => {
    const map = new Map<string, TesterOption>();
    let total = 0;
    for (const exec of executions) {
      if (!ISSUE_STATUSES.has(exec.status)) continue;
      total += 1;
      const name = exec.tester?.trim() || 'Sin tester';
      const key = exec.tester_id ? `id:${exec.tester_id}` : `name:${name.toLowerCase()}`;
      const current = map.get(key);
      if (current) current.count += 1;
      else map.set(key, { key, id: exec.tester_id ?? null, name, count: 1 });
    }
    return {
      issueCount: total,
      testers: [...map.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [executions]);

  const generate = () => {
    const tester = testers.find((option) => option.key === selected);
    const url = exploratoriaApi.bugsReportUrl(runId, {
      testerId: tester?.id ?? null,
      tester: tester?.name ?? null,
    });
    window.open(url, '_blank', 'noopener');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reporte de bugs</DialogTitle>
          <DialogDescription>
            {runName ? `Sesión #${runId} · ${runName}. ` : `Sesión #${runId}. `}
            Elegí si querés el reporte completo o sólo el de un tester.
          </DialogDescription>
        </DialogHeader>

        {issueCount === 0 ? (
          <div className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-footnote text-warn">
            Esta sesión no tiene tests con FAIL, WARNING o BLOCK todavía.
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">
              Tests con issues: {issueCount}
            </p>

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
                name="report-tester"
                value="all"
                checked={selected === 'all'}
                onChange={() => setSelected('all')}
                className="accent-brand"
              />
              <span className="flex-1 font-medium">Todos los testers</span>
              <span className="text-caption text-fg-subtle">{issueCount}</span>
            </label>

            {testers.map((tester) => (
              <label
                key={tester.key}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-footnote transition-colors',
                  selected === tester.key
                    ? 'border-brand bg-brand-soft text-fg'
                    : 'border-border hover:bg-fill-soft',
                )}
              >
                <input
                  type="radio"
                  name="report-tester"
                  value={tester.key}
                  checked={selected === tester.key}
                  onChange={() => setSelected(tester.key)}
                  className="accent-brand"
                />
                <span className="flex-1 truncate">{tester.name}</span>
                <span className="text-caption text-fg-subtle">{tester.count}</span>
              </label>
            ))}
          </div>
        )}

        <p className="text-caption text-fg-subtle">
          Las evidencias se incluyen sólo si están disponibles en esta máquina (o en la copia de
          Postgres). Las que no estén se omiten sin bloquear el reporte.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={generate} disabled={issueCount === 0}>
            <FileText />
            Generar reporte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
