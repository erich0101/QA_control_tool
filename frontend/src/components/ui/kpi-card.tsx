import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type KpiTone = 'neutral' | 'ok' | 'warn' | 'fail' | 'brand';

const TONE_CLASS: Record<KpiTone, string> = {
  neutral: 'text-fg',
  ok: 'text-ok',
  warn: 'text-warn',
  fail: 'text-fail',
  brand: 'text-brand',
};

const BORDER_CLASS: Record<KpiTone, string> = {
  neutral: 'border-t-border',
  ok: 'border-t-ok',
  warn: 'border-t-warn',
  fail: 'border-t-fail',
  brand: 'border-t-brand',
};

interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Texto de contexto debajo del valor. */
  hint?: ReactNode;
  tone?: KpiTone;
  icon?: ReactNode;
  className?: string;
}

/**
 * Indicador de métrica para dashboards y reportes.
 * Un solo componente para no repetir "valor grande + label + hint".
 */
export function KpiCard({ label, value, hint, tone = 'neutral', icon, className }: KpiCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border border-t-[3px] bg-surface p-3.5 shadow-apple-sm',
        BORDER_CLASS[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">
          {label}
        </p>
        {icon ? <span className="shrink-0 text-fg-subtle">{icon}</span> : null}
      </div>
      <p className={cn('mt-1 text-[1.45rem] font-extrabold leading-tight', TONE_CLASS[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-caption text-fg-subtle">{hint}</p> : null}
    </div>
  );
}
