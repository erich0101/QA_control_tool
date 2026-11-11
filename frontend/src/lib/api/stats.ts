import { apiFetch } from './client';

// ── Tipos de respuesta (espejo de /api/stats/*) ──────────────────

export interface OverviewStats {
  summary: { total_cu: number; total_suites: number; total_tc: number };
  statuses: Array<{ status: string; count: number }>;
  coverage: Array<{ title: string; total: number; ok: number }>;
}

export interface SuiteRunStats {
  id: number;
  title: string;
  total_runs: number;
  total_minutes: number;
  avg_minutes: number;
  runs: Array<{ finished_at?: string; minutes?: number; suite_id?: number; id?: number }>;
}

export interface JiraDailyIssue {
  key: string;
  summary?: string;
  status?: string;
  statusCategory?: string;
  priority?: string;
  assignee?: string;
  avatar?: string | null;
  created?: string;
  updated?: string;
}

export interface JiraDailyStats {
  issues: JiraDailyIssue[];
  assigneeCounts: Record<string, number>;
  closedToday: number;
  openCount: number;
  avgResolutionDays: number;
  severityCounts?: Record<string, number>;
  epicCounts?: Record<string, number>;
  jiraUrl?: string;
  error?: string;
}

export interface TeamProductivity {
  name: string;
  avatar?: string | null;
  resolved: number;
  open: number;
  avgDays: number;
  avgOpenAge: number;
  score: number;
  totalWork: number;
}

export interface EpicReport {
  summary: {
    total: number;
    created: number;
    resolved: number;
    open: number;
    openAtStart: number;
    avgResolutionDays: number;
    medianResolution: number;
    p90Resolution: number;
    slaCompliance: number;
    bugResolutionRate: number;
    backlogDelta: number;
    backlogDeltaPercent: number;
  };
  healthScore: number;
  riskScore: number;
  riskLabel: 'low' | 'moderate' | 'high';
  statusBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  trend: Array<{
    label: string;
    created: number;
    resolved: number;
    backlogStart: number;
    backlogEnd: number;
    delta: number;
  }>;
  avgAgeByStatus: Record<string, number>;
  agingBuckets: Record<string, number>;
  insights: Array<{ type: 'success' | 'warning' | 'critical'; text: string }>;
  sla: {
    target: number;
    median: number;
    p90: number;
    compliance: number;
    withinSLA: number;
    total: number;
  };
  qaMetrics: {
    totalTestCases: number;
    executionsByStatus: Record<string, number>;
    passRate: number;
    defectDensity: number;
    totalExecutions: number;
    executionTime: { totalMinutes: number; avgMinutes: number; runCount: number };
    defectsFound: number;
    defectsBySeverity: Record<string, number>;
  };
  error?: string;
}

export const statsApi = {
  overview: (projectId: number) =>
    apiFetch<OverviewStats>('/api/stats/overview', { query: { project_id: projectId } }),

  suites: (projectId: number, dateFrom?: string, dateTo?: string) =>
    apiFetch<{ stats: SuiteRunStats[] }>('/api/stats/suites', {
      query: { project_id: projectId, date_from: dateFrom, date_to: dateTo },
    }),

  jiraDaily: (projectId: number) =>
    apiFetch<JiraDailyStats>('/api/stats/jira-daily', { query: { project_id: projectId } }),

  jiraProductivity: (projectId: number) =>
    apiFetch<TeamProductivity[] | { error: string }>('/api/stats/jira-productivity', {
      query: { project_id: projectId },
    }),

  /** Reporte de la épica para el cliente (Jira + métricas locales de QA). */
  epicReport: (projectId: number, epicKey: string, from: string, to: string) =>
    apiFetch<EpicReport>(`/api/jira/projects/${projectId}/epic-stats`, {
      query: { epicKey, from, to },
    }),
};
