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
};
