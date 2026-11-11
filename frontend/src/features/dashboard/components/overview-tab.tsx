import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { ProgressBar, KpiCard } from './charts';
import { useOverviewStats } from '../use-dashboard';

export function OverviewTab({ projectId }: { projectId: number }) {
  const { data, isLoading, error } = useOverviewStats(projectId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={<BarChart3 />}
        title="Sin datos de métricas"
        description={(error as Error)?.message ?? 'No se pudieron cargar las métricas del proyecto.'}
      />
    );
  }

  const { summary, statuses, coverage } = data;
  const total = summary.total_tc || 1;
  const countOf = (values: string[]) =>
    statuses
      .filter((item) => values.includes((item.status ?? '').toUpperCase()))
      .reduce((acc, item) => acc + Number(item.count ?? 0), 0);

  const pass = countOf(['OK', 'PASS']);
  const fail = countOf(['FAIL']);
  const warn = countOf(['WARNING']);
  const block = countOf(['BLOCK']);
  const skip = countOf(['SKIP', 'SKIPPED']);
  const pending = Math.max(0, total - pass - fail - warn - block - skip);

  const passPct = Math.round((pass / total) * 100);
  const failPct = Math.round((fail / total) * 100);
  const healthTone = passPct > 80 ? 'ok' : passPct > 50 ? 'warn' : 'fail';
  const healthLabel =
    passPct > 80 ? 'Calidad excelente' : passPct > 50 ? 'Calidad aceptable' : 'Riesgo crítico';

  const rows = [
    { label: 'PASS / OK', value: pass, tone: 'ok' as const },
    { label: 'FAILED', value: fail, tone: 'fail' as const },
    { label: 'WARNING', value: warn, tone: 'warn' as const },
    { label: 'BLOCK', value: block, tone: 'warn' as const },
    { label: 'SKIPPED', value: skip, tone: 'muted' as const },
    { label: 'PENDING', value: pending, tone: 'muted' as const },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Casos de uso" value={summary.total_cu} />
        <KpiCard label="Test cases" value={summary.total_tc} tone="brand" hint={`${summary.total_suites} suites activas`} />
        <KpiCard label="Cobertura OK" value={`${passPct}%`} tone="ok" hint={`${pass} de ${total} tests`} />
        <KpiCard label="Riesgo detectado" value={`${failPct}%`} tone="fail" hint={`${fail} tests fallidos`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Estado global de calidad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.map((row) => {
              const pct = Math.round((row.value / total) * 100);
              return (
                <div key={row.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-caption">
                    <span className="font-semibold text-fg-muted">{row.label}</span>
                    <span className="font-bold tabular-nums text-fg">
                      {row.value} ({pct}%)
                    </span>
                  </div>
                  <ProgressBar value={pct} tone={row.tone} />
                </div>
              );
            })}

            <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4 text-center">
              <p className="text-caption text-fg-muted">Índice de salud del proyecto</p>
              <p
                className={
                  healthTone === 'ok'
                    ? 'my-1 text-[28px] font-bold text-ok'
                    : healthTone === 'warn'
                      ? 'my-1 text-[28px] font-bold text-warn'
                      : 'my-1 text-[28px] font-bold text-fail'
                }
              >
                {passPct}%
              </p>
              <p className="text-[10px] uppercase tracking-wider text-fg-subtle">{healthLabel}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Cobertura por caso de uso
            </CardTitle>
          </CardHeader>
          <CardContent>
            {coverage.length === 0 ? (
              <p className="py-6 text-center text-footnote text-fg-subtle">
                El proyecto no tiene casos de uso.
              </p>
            ) : (
              <ul className="scrollbar-apple max-h-96 space-y-3 overflow-y-auto pr-1">
                {coverage.map((item) => {
                  const totalCu = Number(item.total ?? 0);
                  const ok = Number(item.ok ?? 0);
                  const pct = totalCu > 0 ? Math.round((ok / totalCu) * 100) : 0;

                  return (
                    <li key={item.title} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-caption">
                        <span className="truncate font-medium text-fg">{item.title}</span>
                        <span className={pct === 100 ? 'font-bold text-ok' : 'font-bold text-fg'}>
                          {pct}%
                        </span>
                      </div>
                      <ProgressBar value={pct} tone={pct === 100 ? 'ok' : 'brand'} />
                      <p className="text-right text-[10px] text-fg-subtle">
                        {ok} de {totalCu} tests completados
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
