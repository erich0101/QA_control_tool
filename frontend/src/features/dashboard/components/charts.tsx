import { cn } from '@/lib/utils';

// KpiCard vive ahora en el design system; se reexporta para no cambiar imports
// existentes del dashboard.
export { KpiCard } from '@/components/ui/kpi-card';

export function ProgressBar({
  value,
  tone = 'brand',
  className,
}: {
  value: number;
  tone?: 'brand' | 'ok' | 'fail' | 'warn' | 'muted';
  className?: string;
}) {
  const toneClass = {
    brand: 'bg-brand',
    ok: 'bg-ok',
    fail: 'bg-fail',
    warn: 'bg-warn',
    muted: 'bg-fg-subtle',
  }[tone];

  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-fill', className)}>
      <div
        className={cn('h-full rounded-full transition-all', toneClass)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
