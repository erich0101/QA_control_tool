import { cn } from '@/lib/utils';

// KpiCard vive ahora en el design system; se reexporta para no cambiar imports
// existentes del dashboard.
export { KpiCard } from '@/components/ui/kpi-card';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * Donut SVG sin dependencias externas. Se usa para distribuciones de estado
 * (tests, bugs, hallazgos) y para el índice de sanidad.
 */
export function DonutChart({
  segments,
  size = 168,
  thickness = 22,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
}) {
  const total = segments.reduce((acc, segment) => acc + Math.max(0, segment.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--fill)"
          strokeWidth={thickness}
        />
        {total > 0
          ? segments
              .filter((segment) => segment.value > 0)
              .map((segment) => {
                const length = (segment.value / total) * circumference;
                const circle = (
                  <circle
                    key={segment.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={thickness}
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  >
                    <title>{`${segment.label}: ${segment.value}`}</title>
                  </circle>
                );
                offset += length;
                return circle;
              })
          : null}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[22px] font-extrabold leading-none text-fg">{centerValue}</span>
        {centerLabel ? (
          <span className="mt-1 max-w-24 text-[9px] font-semibold uppercase tracking-wide text-fg-subtle">
            {centerLabel}
          </span>
        ) : null}
      </div>
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
