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

  /** Elimina la sesión completa (flujos ejecutados, defectos, hallazgos, evidencias). */
  deleteSession: (runId: number) =>
    apiFetch<{
      ok: true;
      deleted: {
        sessions: number;
        executions: number;
        defects: number;
        hallazgos: number;
        test_cases: number;
        attachments: number;
      };
    }>(`/api/explorations/sessions/${runId}`, { method: 'DELETE' }),

  bugsReportUrl: (
    runId: number,
    options?: { testerId?: number | null; tester?: string | null },
  ) => {
    const params = new URLSearchParams();
    if (options?.testerId) params.set('tester_id', String(options.testerId));
    if (options?.tester) params.set('tester', options.tester);
    const qs = params.toString();
    return `/api/explorations/sessions/${runId}/bugs-report${qs ? `?${qs}` : ''}`;
  },

  /** Testers con actividad exploratoria en el rango (para el modal). */
  statusReportTesters: (projectId: number, dateFrom: string, dateTo: string) =>
    apiFetch<{
      testers: Array<{ id: number | null; name: string; count: number }>;
      date_from: string;
      date_to: string;
    }>('/api/explorations/reports/status/testers', {
      query: { project_id: projectId, date_from: dateFrom, date_to: dateTo },
    }),

  /** Reporte de estatus (todo lo realizado en el rango, por tester o todos). */
  statusReportUrl: (
    projectId: number,
    options: { dateFrom: string; dateTo: string; testerId?: number | null; tester?: string | null },
  ) => {
    const params = new URLSearchParams({
      project_id: String(projectId),
      date_from: options.dateFrom,
      date_to: options.dateTo,
    });
    if (options.testerId) params.set('tester_id', String(options.testerId));
    if (options.tester) params.set('tester', options.tester);
    return `/api/explorations/reports/status?${params.toString()}`;
  },

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
