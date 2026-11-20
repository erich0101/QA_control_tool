import { Bug, Compass, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { OverviewStatusCount } from '@/lib/api/stats';
import { cn } from '@/lib/utils';
import { ProgressBar, KpiCard } from './charts';
import { useOverviewStats } from '../use-dashboard';

const DEFECT_STATUS_TONE: Record<string, 'fail' | 'warn' | 'ok' | 'neutral'> = {
  OPEN: 'fail',
  IN_PROGRESS: 'warn',
  FIXED: 'ok',
  CLOSED: 'ok',
  WONT_FIX: 'neutral',
  DISMISSED: 'neutral',
};

function SumBadge({ status, count }: OverviewStatusCount) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-caption">
      <Badge tone={DEFECT_STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>
      <strong className="tabular-nums text-fg">{count}</strong>
    </span>
  );
}

function DefectStatusList({
  items,
  emptyLabel,
}: {
  items: OverviewStatusCount[];
  emptyLabel: string;
}) {
  const total = items.reduce((acc, item) => acc + Number(item.count ?? 0), 0);
  if (items.length === 0) {
    return <p className="py-3 text-center text-caption text-fg-subtle">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-caption text-fg-subtle">{total} registro(s)</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <SumBadge key={item.status} status={item.status} count={item.count} />
        ))}
      </div>
      <div className="space-y-1.5">
        {items.map((item) => {
          const pct = total > 0 ? Math.round((Number(item.count) / total) * 100) : 0;
          return (
            <div key={`bar-${item.status}`} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-caption font-medium text-fg-muted">
                {item.status}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
                <div
                  className={cn(
                    'h-full rounded-full',
                    DEFECT_STATUS_TONE[item.status] === 'ok'
                      ? 'bg-ok'
                      : DEFECT_STATUS_TONE[item.status] === 'fail'
                        ? 'bg-fail'
                        : DEFECT_STATUS_TONE[item.status] === 'warn'
                          ? 'bg-warn'
                          : 'bg-fg-subtle',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right text-caption tabular-nums text-fg-subtle">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

  const { summary, statuses, coverage, exploratory = [], defects } = data;
  const activeExploratory = summary.active_exploratory ?? exploratory.length;
  // Si el backend sigue en una versión anterior, los campos nuevos llegan
  // undefined y el dashboard parecería mostrar ceros "reales".
  const backendOutdated = !Array.isArray(data.exploratory) || !data.defects;
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
      {backendOutdated ? (
        <div className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-caption text-warn">
          El backend no está devolviendo los datos nuevos del dashboard. Reiniciá el servidor
          (Ctrl + C y <code>npm start</code>) para aplicar la actualización.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Casos de uso" value={summary.total_cu} />
        <KpiCard label="Test cases" value={summary.total_tc} tone="brand" hint={`${summary.total_suites} suites activas`} />
        <KpiCard label="Cobertura OK" value={`${passPct}%`} tone="ok" hint={`${pass} de ${total} tests`} />
        <KpiCard label="Riesgo detectado" value={`${failPct}%`} tone="fail" hint={`${fail} tests fallidos`} />
        <KpiCard
          label="Exploratorias activas"
          value={activeExploratory}
          tone={activeExploratory > 0 ? 'brand' : 'neutral'}
          hint={exploratory.some((session) => session.is_blocked) ? 'Hay sesiones bloqueadas' : 'Sesiones en curso o pausadas'}
        />
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

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-footnote uppercase tracking-wide text-fg-muted">
              <Compass className="size-3.5" />
              Exploratorias activas
            </CardTitle>
            <Badge tone={activeExploratory > 0 ? 'brand' : 'neutral'}>{activeExploratory}</Badge>
          </CardHeader>
          <CardContent>
            {exploratory.length === 0 ? (
              <p className="py-6 text-center text-footnote text-fg-subtle">
                No hay sesiones exploratorias en curso o pausadas.
              </p>
            ) : (
              <ul className="scrollbar-apple max-h-96 space-y-3 overflow-y-auto pr-1">
                {exploratory.map((session) => {
                  const progress =
                    session.total > 0
                      ? Math.round((Number(session.executed) / Number(session.total)) * 100)
                      : 0;
                  const overdue =
                    session.status === 'RUNNING' &&
                    session.deadline_at &&
                    new Date(session.deadline_at).getTime() < Date.now();

                  return (
                    <li
                      key={session.id}
                      className="rounded-lg border border-border bg-surface-2 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-caption font-bold text-brand">
                          #{session.id}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-footnote font-semibold text-fg">
                          {session.name || 'Sesión exploratoria'}
                        </span>
                        <Badge tone={session.is_blocked ? 'fail' : session.status === 'PAUSED' ? 'warn' : 'ok'}>
                          {session.is_blocked ? 'BLOQUEADA' : session.status}
                        </Badge>
                      </div>

                      <p className="mt-1 text-caption text-fg-subtle">
                        {session.tester_name || 'Sin tester'}
                        {session.deadline_at
                          ? ` · Límite ${new Date(session.deadline_at).toLocaleDateString('es-AR')}`
                          : ' · Sin fecha límite'}
                        {overdue ? ' · VENCIDA' : ''}
                      </p>

                      <div className="mt-2 flex items-center gap-2">
                        <ProgressBar
                          value={progress}
                          tone={session.is_blocked ? 'fail' : overdue ? 'warn' : 'brand'}
                          className="flex-1"
                        />
                        <span className="w-24 text-right text-caption tabular-nums text-fg-subtle">
                          {session.executed}/{session.total} ({progress}%)
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-2 text-caption">
                        <span className="text-fail">{session.fail} FAIL</span>
                        <span className="text-warn">{session.block} BLOCK</span>
                        <span className="text-fg-subtle">
                          {session.open_hallazgos} hallazgo(s) abierto(s)
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-footnote uppercase tracking-wide text-fg-muted">
              <Bug className="size-3.5" />
              Bugs y hallazgos
            </CardTitle>
            <div className="flex gap-1.5">
              <Badge tone="warn">{(defects?.bugs ?? []).reduce((acc, item) => acc + Number(item.count ?? 0), 0)} bugs</Badge>
              <Badge tone="brand">{(defects?.hallazgos ?? []).reduce((acc, item) => acc + Number(item.count ?? 0), 0)} hallazgos</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-caption font-bold uppercase tracking-wide text-fg-subtle">
                Bugs de ejecución
              </p>
              <DefectStatusList
                items={defects?.bugs ?? []}
                emptyLabel="Sin bugs registrados."
              />
            </div>
            <div>
              <p className="mb-2 text-caption font-bold uppercase tracking-wide text-fg-subtle">
                Hallazgos
              </p>
              <DefectStatusList
                items={defects?.hallazgos ?? []}
                emptyLabel="Sin hallazgos registrados."
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
