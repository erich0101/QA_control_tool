import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface GroupHeaderProps {
  level: 0 | 1 | 2;
  label: string;
  count: number;
  unit: string;
  critical?: number;
  expanded: boolean;
  onToggle: () => void;
}

const INDENT = ['pl-4', 'pl-9', 'pl-14'] as const;

export function GroupHeader({
  level,
  label,
  count,
  unit,
  critical,
  expanded,
  onToggle,
}: GroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        'flex w-full items-center gap-2 border-b border-border py-2 pr-4 text-left transition-colors hover:bg-fill-soft',
        INDENT[level],
        level === 0 ? 'bg-surface' : level === 1 ? 'bg-surface-2' : 'bg-surface-2/50',
      )}
    >
      <ChevronRight
        className={cn('size-3.5 shrink-0 text-fg-subtle transition-transform', expanded && 'rotate-90')}
      />
      <span
        className={cn(
          'text-fg',
          level === 0 ? 'text-footnote font-bold' : 'text-caption font-semibold',
        )}
      >
        {label}
      </span>
      <Badge tone="neutral">
        {count} {count === 1 ? unit : `${unit}s`}
      </Badge>
      {critical ? (
        <span className="text-caption font-semibold text-fail">
          ⚠ {critical} {critical === 1 ? 'crítico' : 'críticos'}
        </span>
      ) : null}
    </button>
  );
}
