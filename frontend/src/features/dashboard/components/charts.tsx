import { cn } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'default' | 'ok' | 'fail' | 'warn' | 'brand';
}) {
  const toneClass = {
    default: 'text-fg',
    ok: 'text-ok',
    fail: 'text-fail',
    warn: 'text-warn',
    brand: 'text-brand',
  }[tone];

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-caption font-bold uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={cn('mt-1.5 text-[26px] font-bold leading-none', toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-caption text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

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
