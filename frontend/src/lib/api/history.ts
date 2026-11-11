import { apiFetch } from './client';
import type { Defect, HistoryPage, TestRun } from './types';

export const historyApi = {
  listRuns: (projectId: number, page = 1, limit = 50) =>
    apiFetch<HistoryPage>('/api/history', {
      query: { project_id: projectId, page, limit },
    }),

  runBugs: (runId: number) =>
    apiFetch<{ bugs: Defect[] }>(`/api/runs/${runId}/bugs`),

  /** Crea un ciclo de retesting con los tests que fallaron/bloquearon. */
  retest: (runId: number) =>
    apiFetch<{ ok: true; suite_id?: number }>(`/api/runs/${runId}/retest`, { method: 'POST' }),

  reportUrl: (runId: number) => `/api/reports/${runId}`,
};

export const defectsApi = {
  list: (projectId: number) =>
    apiFetch<{ defects: Defect[] }>('/api/defects', { query: { project_id: projectId } }),

  jiraStatus: (projectId: number) =>
    apiFetch<{ statuses: Record<string, { status: string; statusCategory?: string }> }>(
      '/api/defects/jira-status',
      { query: { project_id: projectId } },
    ),

  dismiss: (id: number, dismissed: boolean) =>
    apiFetch<{ ok: true }>(`/api/defects/${id}/dismiss`, {
      method: 'POST',
      body: { dismissed },
    }),
};

export type { Defect, HistoryPage, TestRun };
