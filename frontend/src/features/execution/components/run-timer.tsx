import { useEffect, useState } from 'react';
import type { ExecutionRun } from '@/lib/api/types';
import { cn } from '@/lib/utils';

function formatSeconds(total: number): string {
  const hours = Math.floor(total / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const seconds = (total % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Cronómetro del ciclo: acumulado + delta desde la última reanudación.
 * Se recalcula cada segundo localmente para no refetchear la API.
 */
export function RunTimer({ run, className }: { run: ExecutionRun; className?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (run.status !== 'RUNNING') return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [run.status]);

  const accumulated = run.accumulated_seconds ?? 0;
  const runningDelta =
    run.status === 'RUNNING' && run.last_resume_at
      ? Math.max(0, Math.floor((now - new Date(run.last_resume_at).getTime()) / 1000))
      : 0;

  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {formatSeconds(accumulated + runningDelta)}
    </span>
  );
}
