import { Badge } from '@/components/ui/badge';
import type { StoryPriority, StoryStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils';

const STATUS_TONES: Record<string, 'warn' | 'ok' | 'neutral' | 'fail'> = {
  'En Análisis': 'warn',
  Finalizada: 'ok',
  Deprecada: 'neutral',
  Rechazada: 'fail',
};

const PRIORITY_TONES: Record<string, 'fail' | 'warn' | 'ok'> = {
  Alta: 'fail',
  Media: 'warn',
  Baja: 'ok',
};

export function StoryStatusBadge({ status }: { status?: StoryStatus | string }) {
  const value = status || 'En Análisis';
  return <Badge tone={STATUS_TONES[value] ?? 'neutral'}>{value}</Badge>;
}

export function StoryPriorityBadge({
  priority,
  className,
}: {
  priority?: StoryPriority | string;
  className?: string;
}) {
  const value = priority || 'Media';
  return (
    <Badge tone={PRIORITY_TONES[value] ?? 'neutral'} className={className}>
      {value}
    </Badge>
  );
}

const SEVERITY_DOT: Record<string, string> = {
  Alta: 'bg-fail',
  Media: 'bg-warn',
  Baja: 'bg-ok',
};

export function SeverityDot({ severity }: { severity?: string }) {
  const value = severity || 'Alta';
  return (
    <span
      className={cn('mt-1.5 size-2 shrink-0 rounded-full', SEVERITY_DOT[value] ?? 'bg-fail')}
      title={`Severidad ${value}`}
      aria-label={`Severidad ${value}`}
    />
  );
}
