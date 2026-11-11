import { useState } from 'react';
import { BarChart3, Download, FileText, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton } from '@/components/ui/skeleton';
import type { EpicReport } from '@/lib/api/stats';
import { cn } from '@/lib/utils';
import { useJiraEpics } from '@/features/test-suites/use-test-suites';
import { KpiCard, ProgressBar } from './charts';
import { useEpicReport } from '../use-dashboard';

function isoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

function defaultFrom() {
  const date = new Date();
  date.setDate(date.getDate() - 28);
  return isoDate(date);
}

function formatMinutes(minutes: number) {
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

const RISK_META = {
  low: { label: 'Bajo', tone: 'ok' as const, color: 'text-ok' },
  moderate: { label: 'Moderado', tone: 'warn' as const, color: 'text-warn' },
  high: { label: 'Alto', tone: 'fail' as const, color: 'text-fail' },
};

export function EpicReportTab({ projectId }: { projectId: number }) {
  const { data: epics = [] } = useJiraEpics(projectId);

  const [epicKey, setEpicKey] = useState('');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => isoDate(new Date()));

  // El reporte se genera con "Generar": las fechas no disparan queries al tipear.
  const [applied, setApplied] = useState<{ epicKey: string; from: string; to: string } | null>(null);

  const { data, isLoading, isFetching, refetch } = useEpicReport(
    projectId,
    applied?.epicKey ?? null,
    applied?.from ?? '',
    applied?.to ?? '',
  );

  const generate = () => {
    if (!epicKey) return;
    setApplied({ epicKey, from, to });
  };

  const report = data && !data.error ? data : null;

  return (
    <div className="space-y-5">
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <Field label="Épica" htmlFor="epic-select" className="min-w-52 flex-1">
            <SelectField
              id="epic-select"
              value={epicKey}
              onValueChange={setEpicKey}
              placeholder={
                epics.length > 0 ? 'Seleccionar épica' : 'Sin épicas (revisá el token de Jira)'
              }
              options={epics.map((epic) => ({
                value: epic.key,
                label: `${epic.key} · ${epic.name}`,
              }))}
              disabled={epics.length === 0}
            />
          </Field>

          <Field label="Desde" htmlFor="epic-from">
            <Input
              id="epic-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-9 w-36"
            />
          </Field>

          <Field label="Hasta" htmlFor="epic-to">
            <Input
              id="epic-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-9 w-36"
            />
          </Field>

          <Button variant="ghost" size="icon" aria-label="Recargar" onClick={() => refetch()}>
            <RefreshCw />
          </Button>

          <Button variant="primary" onClick={generate} disabled={!epicKey} loading={isFetching}>
            <BarChart3 />
            Generar reporte
          </Button>

          <Button
            variant="secondary"
            onClick={() => window.print()}
            disabled={!report}
            title="Imprimir o guardar como PDF"
          >
            <Download />
            Exportar PDF
          </Button>
        </CardContent>
      </Card>

      {!applied ? (
        <EmptyState
          icon={<FileText />}
          title="Seleccioná una épica y un período"
          description="El reporte combina los bugs de Jira con las métricas de testing registradas en la herramienta."
        />
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !report ? (
        <div className="rounded-lg border border-fail/30 bg-fail-soft px-4 py-3 text-footnote text-fail">
          {data?.error ?? 'No se pudo generar el reporte.'}
        </div>
      ) : (
        <ReportBody
          report={report}
          epicKey={applied.epicKey}
          from={applied.from}
          to={applied.to}
        />
      )}
    </div>
  );
}

function ReportBody({
  report,
  epicKey,
  from,
  to,
}: {
  report: EpicReport;
  epicKey: string;
  from: string;
  to: string;
}) {
  const risk = RISK_META[report.riskLabel] ?? RISK_META.moderate;
  const { summary, sla, qaMetrics } = report;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-title3 font-semibold text-fg">Resumen de la épica {epicKey}</h2>
        <p className="text-caption text-fg-muted">
          Período: {from} al {to}
        </p>
      </div>

      {report.insights.length > 0 ? (
        <ul className="space-y-1.5">
          {report.insights.map((insight, index) => (
            <li
              key={`${insight.type}-${index}`}
              className={cn(
                'flex items-center gap-2 rounded-md border-l-4 px-4 py-2 text-footnote font-medium',
                insight.type === 'success' && 'border-l-ok bg-ok-soft text-ok',
                insight.type === 'warning' && 'border-l-warn bg-warn-soft text-warn',
                insight.type === 'critical' && 'border-l-fail bg-fail-soft text-fail',
              )}
            >
              <span aria-hidden>
                {insight.type === 'success' ? '✅' : insight.type === 'critical' ? '🚨' : '⚠️'}
              </span>
              {insight.text}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[160px_180px_repeat(4,minmax(0,1fr))]">
        <HealthGauge score={report.healthScore} />

        <Card className="flex flex-col items-center justify-center gap-1 p-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-fg-subtle">
            Riesgo de entrega
          </p>
          <p className={cn('text-title2 font-bold uppercase', risk.color)}>{risk.label}</p>
          <p className="text-caption text-fg-muted">Score: {report.riskScore}/100</p>
          <ProgressBar
            value={report.riskScore}
            tone={risk.tone === 'ok' ? 'ok' : risk.tone === 'warn' ? 'warn' : 'fail'}
            className="mt-1"
          />
        </Card>

        <KpiCard label="Total bugs" value={summary.total} tone="brand" hint="creados en el período" />
        <KpiCard
          label="% resueltos"
          value={`${summary.bugResolutionRate}%`}
          tone={summary.bugResolutionRate >= 100 ? 'ok' : summary.bugResolutionRate >= 50 ? 'warn' : 'fail'}
          hint={`${summary.resolved} de ${summary.total}`}
        />
        <KpiCard
          label="Variación pendientes"
          value={`${summary.backlogDelta > 0 ? '+' : ''}${summary.backlogDelta}`}
          tone={summary.backlogDelta <= 0 ? 'ok' : 'fail'}
          hint={`${summary.backlogDeltaPercent > 0 ? '+' : ''}${summary.backlogDeltaPercent}% vs. inicio`}
        />
        <KpiCard label="Pendientes" value={summary.open} tone="fail" hint="sin resolver" />
      </div>

      {qaMetrics ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              🧪 Resultados del testing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <QaStat label="Casos de prueba" value={qaMetrics.totalTestCases} />
              <QaStat
                label="% aprobados"
                value={`${qaMetrics.passRate}%`}
                tone={qaMetrics.passRate >= 80 ? 'ok' : qaMetrics.passRate >= 50 ? 'warn' : 'fail'}
              />
              <QaStat
                label="Tasa de defectos"
                value={`${qaMetrics.defectDensity}%`}
                tone={qaMetrics.defectDensity > 0.5 ? 'fail' : 'ok'}
              />
              <QaStat label="Ciclos de test" value={qaMetrics.totalExecutions} />
              <QaStat
                label="Tiempo de ejecución"
                value={formatMinutes(qaMetrics.executionTime.totalMinutes)}
                tone="warn"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="text-caption font-bold uppercase tracking-wide text-fg-subtle">
                Defectos encontrados
              </span>
              <Badge tone="fail">{qaMetrics.defectsFound} en total</Badge>
              {Object.entries(qaMetrics.defectsBySeverity).map(([severity, count]) => (
                <Badge key={severity} tone={severity === 'Crítica' || severity === 'Alta' ? 'fail' : 'warn'}>
                  {severity}: {count}
                </Badge>
              ))}
              {Object.entries(qaMetrics.executionsByStatus)
                .filter(([, count]) => count > 0)
                .map(([status, count]) => (
                  <Badge key={status} tone="neutral">
                    {status}: {count}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Estado de los bugs del período
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {Object.entries(report.statusBreakdown).map(([status, count]) => {
              const total = Math.max(1, summary.total);
              const pct = Math.round((count / total) * 100);
              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-caption">
                    <span className="font-medium text-fg-muted">{status}</span>
                    <span className="font-bold text-fg">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <ProgressBar value={pct} tone={status === 'Done' ? 'ok' : status === 'Other' ? 'muted' : 'brand'} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Prioridad de los bugs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {Object.entries(report.priorityBreakdown).length === 0 ? (
              <p className="text-footnote text-fg-subtle">Sin datos de prioridad.</p>
            ) : (
              Object.entries(report.priorityBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([priority, count]) => {
                  const total = Math.max(1, summary.total);
                  const pct = Math.round((count / total) * 100);
                  const tone =
                    priority === 'Highest' || priority === 'High'
                      ? 'fail'
                      : priority === 'Low' || priority === 'Lowest'
                        ? 'ok'
                        : 'warn';
                  return (
                    <div key={priority} className="space-y-1">
                      <div className="flex items-center justify-between text-caption">
                        <span className="font-medium text-fg-muted">{priority}</span>
                        <span className="font-bold text-fg">{count}</span>
                      </div>
                      <ProgressBar value={pct} tone={tone} />
                    </div>
                  );
                })
            )}
          </CardContent>
        </Card>
      </div>

      {report.trend.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Tendencia semanal (creados vs. resueltos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart trend={report.trend} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Antigüedad de pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {Object.entries(report.agingBuckets).map(([bucket, count]) => (
              <div key={bucket} className="rounded-md bg-fill-soft px-3 py-2">
                <p className="text-caption text-fg-subtle">{bucket}</p>
                <p
                  className={cn(
                    'text-title3 font-bold',
                    bucket === '+15d' && count > 0 ? 'text-fail' : 'text-fg',
                  )}
                >
                  {count}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              Edad promedio por estado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(report.avgAgeByStatus).map(([status, days]) => (
              <div key={status} className="flex items-center justify-between text-caption">
                <span className="text-fg-muted">{status}</span>
                <span className="font-semibold text-fg">{days} días</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-footnote uppercase tracking-wide text-fg-muted">
              SLA de resolución
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-fg-muted">Cumplimiento (≤ {sla.target} días)</span>
                <span className="font-bold text-fg">{sla.compliance}%</span>
              </div>
              <ProgressBar
                value={sla.compliance}
                tone={sla.compliance >= 90 ? 'ok' : sla.compliance >= 70 ? 'warn' : 'fail'}
                className="mt-1"
              />
              <p className="mt-1 text-caption text-fg-subtle">
                {sla.withinSLA} de {sla.total} bugs dentro del SLA
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-caption">
              <div>
                <p className="text-fg-subtle">Mediana</p>
                <p className="font-semibold text-fg">{sla.median} días</p>
              </div>
              <div>
                <p className="text-fg-subtle">P90</p>
                <p className="font-semibold text-fg">{sla.p90} días</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HealthGauge({ score }: { score: number }) {
  const tone = score >= 70 ? 'var(--color-ok)' : score >= 40 ? 'var(--color-warn)' : 'var(--color-fail)';
  const circumference = 2 * Math.PI * 38;

  return (
    <Card className="flex flex-col items-center justify-center gap-1 p-4">
      <div className="relative size-[90px]">
        <svg width="90" height="90" viewBox="0 0 90 90" className="-rotate-90">
          <circle cx="45" cy="45" r="38" fill="none" stroke="var(--color-fill)" strokeWidth="6" />
          <circle
            cx="45"
            cy="45"
            r="38"
            fill="none"
            stroke={tone}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-title3 font-bold text-fg">{score}</span>
          <span className="text-[10px] font-semibold text-fg-subtle">/ 100</span>
        </div>
      </div>
      <p
        className="text-center text-[10px] font-bold uppercase tracking-wide text-fg-subtle"
        title="Puntaje de 0 a 100 que resume el estado del testing de la épica: bugs, gravedad y velocidad de resolución."
      >
        Calidad general
      </p>
    </Card>
  );
}

function QaStat({
  label,
  value,
  tone = 'brand',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'brand' | 'ok' | 'warn' | 'fail';
}) {
  const toneClass = {
    brand: 'text-brand',
    ok: 'text-ok',
    warn: 'text-warn',
    fail: 'text-fail',
  }[tone];

  return (
    <div className="rounded-md bg-fill-soft px-3 py-2 text-center">
      <p className={cn('text-title3 font-bold', toneClass)}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
    </div>
  );
}

function TrendChart({ trend }: { trend: EpicReport['trend'] }) {
  const max = Math.max(...trend.map((week) => Math.max(week.created, week.resolved)), 1);

  return (
    <div>
      <div className="flex items-end gap-3 overflow-x-auto pb-2">
        {trend.map((week) => {
          const createdHeight = Math.round((week.created / max) * 100);
          const resolvedHeight = Math.round((week.resolved / max) * 100);

          return (
            <div key={week.label} className="flex min-w-14 flex-col items-center gap-1">
              <div className="flex h-28 items-end gap-1">
                <div
                  className="w-3 rounded-t bg-fail/70"
                  style={{ height: `${Math.max(createdHeight, week.created > 0 ? 4 : 0)}%` }}
                  title={`Creados: ${week.created}`}
                />
                <div
                  className="w-3 rounded-t bg-ok/80"
                  style={{ height: `${Math.max(resolvedHeight, week.resolved > 0 ? 4 : 0)}%` }}
                  title={`Resueltos: ${week.resolved}`}
                />
              </div>
              <span className="text-[10px] text-fg-subtle">
                {new Date(week.label).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
              </span>
              <span className="text-[10px] font-semibold text-fg-muted">B: {week.backlogEnd}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-4 text-caption text-fg-subtle">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-fail/70" /> Creados
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-ok/80" /> Resueltos
        </span>
        <span className="flex items-center gap-1">B: backlog al cierre de la semana</span>
      </div>
    </div>
  );
}
