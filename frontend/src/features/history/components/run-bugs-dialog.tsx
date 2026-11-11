import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { TestRun } from '@/lib/api/types';
import { useRunBugs } from '../use-history';
import { Bug } from 'lucide-react';

interface RunBugsDialogProps {
  run: TestRun | null;
  onOpenChange: (open: boolean) => void;
}

export function RunBugsDialog({ run, onOpenChange }: RunBugsDialogProps) {
  const { data: bugs = [], isLoading } = useRunBugs(run?.id ?? null);

  return (
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
          <ul className="scrollbar-apple max-h-96 space-y-1.5 overflow-y-auto">
            {bugs.map((bug) => (
              <li
                key={bug.id}
                className="rounded-md border border-border bg-surface-2 px-3 py-2"
              >
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
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
