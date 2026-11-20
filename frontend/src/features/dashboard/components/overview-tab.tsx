import { Bug, Compass, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { OverviewStatusCount } from '@/lib/api/stats';
import { cn } from '@/lib/utils';
import { DonutChart, ProgressBar, KpiCard } from './charts';
import { useOverviewStats } from '../use-dashboard';

const DEFECT_STATUS_TONE: Record<string, 'fail' | 'warn' | 'ok' | 'neutral'> = {
  OPEN: 'fail',
  ABIERTO: 'fail',
  IN_PROGRESS: 'warn',
  EN_PROGRESO: 'warn',
  BLOQUEADO: 'warn',
  FIXED: 'ok',
  CLOSED: 'ok',
  CERRADO: 'ok',
  WONT_FIX: 'neutral',
  DISMISSED: 'neutral',
  RESUELTO: 'ok',
};

const RESOLVED_DEFECT_STATUSES = new Set([
  'FIXED',
  'CLOSED',
  'CERRADO',
  'WONT_FIX',
  'DISMISSED',
  'RESUELTO',
  'RESOLVED',
  'DESCARTADO',
]);

const isOpenDefect = (status?: string) =>
  !RESOLVED_DEFECT_STATUSES.has(String(status || 'OPEN').toUpperCase());

const TEST_COLORS: Record<string, string> = {
  'PASS / OK': '#16a34a',
  FAILED: '#dc2626',
  WARNING: '#d97706',
  BLOCK: '#ea580c',
  SKIPPED: '#94a3b8',
  PENDING: '#cbd5e1',
};

function SumBadge({ status, count }: OverviewStatusCount) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-caption">
      <Badge tone={DEFECT_STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>
      <strong className="tabular-nums text-fg">{count}</strong>
    </span>
  );
}

function DefectSummary({
  title,
  statuses,
  severity,
  open,
  resolved,
  total,
  emptyLabel,
}: {
  title: string;
  statuses: OverviewStatusCount[];
  severity: Array<{ severity: string; count: number }>;
  open: number;
  resolved: number;
  total: number;
  emptyLabel: string;
}) {
  if (total === 0) {
    return (
      <div>
        <p className="mb-2 text-caption font-bold uppercase tracking-wide text-fg-subtle">
          {title}
        </p>
        <p className="py-3 text-center text-caption text-fg-subtle">{emptyLabel}</p>
      </div>
    );
  }

  const openPct = Math.round((open / total) * 100);
  const severityMax = Math.max(1, ...severity.map((item) => Number(item.count ?? 0)));
  const severityColor = (value: string) =>
    value === 'Crítica' || value === 'Alta'
      ? 'bg-fail'
      : value === 'Media'
        ? 'bg-warn'
        : 'bg-ok';

  return (
    <div>
      <p className="mb-2 text-caption font-bold uppercase tracking-wide text-fg-subtle">
        {title}
      </p>

      <div className="flex items-center gap-3">
        <DonutChart
          size={116}
          thickness={16}
          segments={[
            { label: 'Abiertos', value: open, color: '#dc2626' },
            { label: 'Resueltos', value: resolved, color: '#16a34a' },
          ]}
          centerValue={`${openPct}%`}
          centerLabel="abiertos"
        />
        <div className="space-y-1 text-caption">
          <p className="text-fg-muted">
            Total <strong className="text-fg">{total}</strong>
          </p>
          <p className="text-fail">
            Abiertos <strong>{open}</strong>
          </p>
          <p className="text-ok">
            Resueltos <strong>{resolved}</strong>
          </p>
        </div>
      </div>

      {severity.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
            Abiertos por severidad
          </p>
          {severity.map((item) => {
            const pct = Math.round((Number(item.count) / severityMax) * 100);
            return (
              <div key={`sev-${item.severity}`} className="flex items-center gap-2 text-caption">
                <span className="w-14 shrink-0 text-fg-muted">{item.severity}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
                  <div
                    className={cn('h-full rounded-full', severityColor(item.severity))}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <strong className="w-6 text-right tabular-nums text-fg">{item.count}</strong>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1">
        {statuses.map((item) => (
          <SumBadge key={item.status} status={item.status} count={item.count} />
        ))}
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

  const rows = [
    { label: 'PASS / OK', value: pass, tone: 'ok' as const, color: TEST_COLORS['PASS / OK'] },
    { label: 'FAILED', value: fail, tone: 'fail' as const, color: TEST_COLORS.FAILED },
    { label: 'WARNING', value: warn, tone: 'warn' as const, color: TEST_COLORS.WARNING },
    { label: 'BLOCK', value: block, tone: 'warn' as const, color: TEST_COLORS.BLOCK },
    { label: 'SKIPPED', value: skip, tone: 'muted' as const, color: TEST_COLORS.SKIPPED },
    { label: 'PENDING', value: pending, tone: 'muted' as const, color: TEST_COLORS.PENDING },
  ];

  const evaluated = pass + fail + warn;
  const acceptanceEvaluatedPct = evaluated > 0 ? Math.round((pass / evaluated) * 100) : null;
  const executed = pass + fail + warn + block + skip;
  const executionPct = total > 0 ? Math.round((executed / total) * 100) : 0;
  const riskPct = total > 0 ? Math.round(((fail + block) / total) * 100) : 0;

  const bugStatuses = defects?.bugs ?? [];
  const hallazgoStatuses = defects?.hallazgos ?? [];
  const sumCounts = (items: Array<{ count: number }>) =>
    items.reduce((acc, item) => acc + Number(item.count ?? 0), 0);
  const bugTotal = sumCounts(bugStatuses);
  const openBugs = sumCounts(bugStatuses.filter((item) => isOpenDefect(item.status)));
  const resolvedBugs = bugTotal - openBugs;
  const hallazgoTotal = sumCounts(hallazgoStatuses);
  const openHallazgos = sumCounts(hallazgoStatuses.filter((item) => isOpenDefect(item.status)));
  const resolvedHallazgos = hallazgoTotal - openHallazgos;

  const openBugsBySeverity = defects?.open_bugs_by_severity ?? [];
  const openHallazgosBySeverity = defects?.open_hallazgos_by_severity ?? [];
  const criticalOpenBugs = openBugsBySeverity
    .filter((item) => ['Crítica', 'Alta'].includes(item.severity))
    .reduce((acc, item) => acc + Number(item.count ?? 0), 0);

  const blockedSessions = exploratory.filter((session) => session.is_blocked).length;
  const overdueSessions = exploratory.filter(
    (session) =>
      session.status === 'RUNNING' &&
      session.deadline_at &&
      new Date(session.deadline_at).getTime() < Date.now(),
  ).length;

  const gates = [
    { label: 'Pass rate ≥ 80%', ok: passPct >= 80, value: `${passPct}%` },
    { label: 'Sin tests FAIL', ok: fail === 0, value: `${fail}` },
    { label: 'Sin tests BLOCK', ok: block === 0, value: `${block}` },
    { label: 'Sin tests pendientes', ok: pending === 0, value: `${pending}` },
    { label: 'Sin bugs abiertos', ok: openBugs === 0, value: `${openBugs}` },
    { label: 'Sin hallazgos abiertos', ok: openHallazgos === 0, value: `${openHallazgos}` },
    { label: 'Sin exploratorias bloqueadas', ok: blockedSessions === 0, value: `${blockedSessions}` },
  ];
  const failedGates = gates.filter((gate) => !gate.ok).length;

  const decisionTone =
    fail > 0 || block > 0 || criticalOpenBugs > 0
      ? 'fail'
      : failedGates > 0
        ? 'warn'
        : 'ok';
  const decisionLabel =
    decisionTone === 'ok'
      ? 'Listo para entrega'
      : decisionTone === 'warn'
        ? 'Con observaciones'
        : 'No apto / requiere atención';

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

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Sanidad de los tests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-5">
              <DonutChart
                segments={rows.map((row) => ({
                  label: row.label,
                  value: row.value,
                  color: row.color,
                }))}
                centerValue={`${passPct}%`}
                centerLabel="Pass rate"
              />

              <div className="min-w-56 flex-1 space-y-2">
                {rows.map((row) => {
                  const pct = Math.round((row.value / total) * 100);
                  return (
                    <div key={row.label} className="flex items-center gap-2 text-caption">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="flex-1 font-medium text-fg-muted">{row.label}</span>
                      <span className="w-16 text-right font-bold tabular-nums text-fg">
                        {row.value}
                      </span>
                      <span className="w-10 text-right tabular-nums text-fg-subtle">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <MiniMetric
                label="Aceptación evaluada"
                value={acceptanceEvaluatedPct == null ? '—' : `${acceptanceEvaluatedPct}%`}
                hint="OK / (OK + FAIL + WARNING)"
                tone={
                  acceptanceEvaluatedPct == null
                    ? 'neutral'
                    : acceptanceEvaluatedPct >= 80
                      ? 'ok'
                      : acceptanceEvaluatedPct >= 50
                        ? 'warn'
                        : 'fail'
                }
              />
              <MiniMetric
                label="Ejecución"
                value={`${executionPct}%`}
                hint={`${executed} de ${total} tests`}
                tone={executionPct >= 80 ? 'ok' : executionPct >= 50 ? 'warn' : 'fail'}
              />
              <MiniMetric
                label="Riesgo FAIL + BLOCK"
                value={`${riskPct}%`}
                hint={`${fail + block} tests en riesgo`}
                tone={riskPct === 0 ? 'ok' : riskPct <= 10 ? 'warn' : 'fail'}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Puertas de calidad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className={
                decisionTone === 'ok'
                  ? 'rounded-lg border border-ok/30 bg-ok-soft px-3 py-2.5'
                  : decisionTone === 'warn'
                    ? 'rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5'
                    : 'rounded-lg border border-fail/30 bg-fail-soft px-3 py-2.5'
              }
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-fg-subtle">
                Decisión sugerida
              </p>
              <p
                className={
                  decisionTone === 'ok'
                    ? 'text-lg font-extrabold text-ok'
                    : decisionTone === 'warn'
                      ? 'text-lg font-extrabold text-warn'
                      : 'text-lg font-extrabold text-fail'
                }
              >
                {decisionLabel}
              </p>
              <p className="text-caption text-fg-muted">
                {failedGates === 0
                  ? 'Todas las puertas de calidad están en verde.'
                  : `${failedGates} de ${gates.length} puertas requieren atención.`}
              </p>
            </div>

            <ul className="space-y-1.5">
              {gates.map((gate) => (
                <li
                  key={gate.label}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-caption"
                >
                  <span
                    className={
                      gate.ok
                        ? 'size-2 shrink-0 rounded-full bg-ok'
                        : 'size-2 shrink-0 rounded-full bg-fail'
                    }
                  />
                  <span className="flex-1 text-fg-muted">{gate.label}</span>
                  <strong className="tabular-nums text-fg">{gate.value}</strong>
                  <Badge tone={gate.ok ? 'ok' : 'fail'}>{gate.ok ? 'OK' : 'ALERTA'}</Badge>
                </li>
              ))}
            </ul>
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
            <div className="flex gap-1.5">
              {overdueSessions > 0 ? (
                <Badge tone="warn">{overdueSessions} vencida(s)</Badge>
              ) : null}
              {blockedSessions > 0 ? (
                <Badge tone="fail">{blockedSessions} bloqueada(s)</Badge>
              ) : null}
              <Badge tone={activeExploratory > 0 ? 'brand' : 'neutral'}>{activeExploratory}</Badge>
            </div>
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
            <DefectSummary
              title="Bugs de ejecución"
              statuses={bugStatuses}
              severity={openBugsBySeverity}
              open={openBugs}
              resolved={resolvedBugs}
              total={bugTotal}
              emptyLabel="Sin bugs registrados."
            />
            <DefectSummary
              title="Hallazgos"
              statuses={hallazgoStatuses}
              severity={openHallazgosBySeverity}
              open={openHallazgos}
              resolved={resolvedHallazgos}
              total={hallazgoTotal}
              emptyLabel="Sin hallazgos registrados."
            />
          </CardContent>
        </Card>
      </div>

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
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {coverage.map((item) => {
                const totalCu = Number(item.total ?? 0);
                const ok = Number(item.ok ?? 0);
                const pct = totalCu > 0 ? Math.round((ok / totalCu) * 100) : 0;
                return (
                  <li key={item.title} className="space-y-1 rounded-md border border-border p-2.5">
                    <div className="flex items-center justify-between gap-3 text-caption">
                      <span className="truncate font-medium text-fg" title={item.title}>
                        {item.title}
                      </span>
                      <span className={pct === 100 ? 'font-bold text-ok' : 'font-bold text-fg'}>
                        {pct}%
                      </span>
                    </div>
                    <ProgressBar value={pct} tone={pct === 100 ? 'ok' : pct >= 50 ? 'brand' : 'warn'} />
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
  );
}

function MiniMetric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'ok' | 'warn' | 'fail' | 'neutral';
}) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
      <p
        className={
          tone === 'ok'
            ? 'text-lg font-extrabold text-ok'
            : tone === 'warn'
              ? 'text-lg font-extrabold text-warn'
              : tone === 'fail'
                ? 'text-lg font-extrabold text-fail'
                : 'text-lg font-extrabold text-fg'
        }
      >
        {value}
      </p>
      <p className="text-[10px] text-fg-subtle">{hint}</p>
    </div>
  );
}
