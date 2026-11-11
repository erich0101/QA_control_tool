import { apiFetch } from './client';
import type { BugDraft, ExploratoryDetail, ExploratorySession } from './types';

export interface StartSessionInput {
  project_id: number;
  name: string;
  charter?: string;
  timebox_minutes?: number | null;
}

export interface ExecuteFlowInput {
  run_id: number;
  status: string;
  observations?: string;
  obtained_result?: string;
  bugs?: BugDraft[];
}

export const exploratoriaApi = {
  listSessions: (projectId: number, status?: string) =>
    apiFetch<{ sessions: ExploratorySession[] }>('/api/explorations/sessions', {
      query: { project_id: projectId, status },
    }),

  getSession: (runId: number) =>
    apiFetch<ExploratoryDetail>(`/api/explorations/sessions/${runId}`),

  startSession: (input: StartSessionInput) =>
    apiFetch<{ ok: true; run_id: number; suite_id: number }>('/api/explorations/sessions', {
      method: 'POST',
      body: input,
    }),

  addFlow: (runId: number, input: { title: string; steps?: string; expected_result?: string }) =>
    apiFetch<{ ok: true; id?: number }>(`/api/explorations/sessions/${runId}/flows`, {
      method: 'POST',
      body: input,
    }),

  executeFlow: (tcId: number, input: ExecuteFlowInput) =>
    apiFetch<{ ok: true; execution_id?: number; defect_ids?: number[] }>(
      `/api/explorations/flows/${tcId}/execute`,
      { method: 'POST', body: input },
    ),

  finishSession: (runId: number) =>
    apiFetch<{ ok: true }>(`/api/explorations/sessions/${runId}/finish`, { method: 'POST' }),

  bugsReportUrl: (runId: number) => `/api/explorations/sessions/${runId}/bugs-report`,

  /** Evidencia atada a la ejecución del flujo (no al TC). */
  uploadEvidence: ({ file, executionId, category }: { file: File; executionId: number; category: string }) => {
    const formData = new FormData();
    formData.append('evidence', file);
    formData.append('execution_id', String(executionId));
    formData.append('category', category);

    return apiFetch<{ ok: true; id: number }>('/api/evidence', {
      method: 'POST',
      body: formData,
    });
  },

  deleteEvidence: (id: number) => apiFetch<{ ok: true }>(`/api/evidence/${id}`, { method: 'DELETE' }),
};
