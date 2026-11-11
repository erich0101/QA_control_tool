import { apiFetch } from './client';
import type { BugDraft, Defect, ExecutionStatus } from './types';

export interface SaveExecutionInput {
  status: ExecutionStatus;
  observations?: string;
  obtained_result?: string;
  bugs?: BugDraft[];
}

export interface EvidenceUploadInput {
  file: File;
  testCaseId: number;
  category: string;
}

export const executionApi = {
  pauseRun: (runId: number) =>
    apiFetch<{ ok: true; accumulated_seconds?: number }>(`/api/runs/${runId}/pause`, {
      method: 'POST',
    }),

  resumeRun: (runId: number) =>
    apiFetch<{ ok: true; last_resume_at?: string }>(`/api/runs/${runId}/resume`, {
      method: 'POST',
    }),

  finishRun: (suiteId: number) =>
    apiFetch<{ ok: true }>(`/api/test-suites/${suiteId}/finish-execution`, {
      method: 'POST',
    }),

  /** Inicia la ejecución de regresión de todas las suites del CU (solo tests asignados). */
  startAllUseCase: (useCaseId: number) =>
    apiFetch<{ ok: true; executedSuites?: number; totalTests?: number }>(
      `/api/use-cases/${useCaseId}/start-all`,
      {
        method: 'POST',
        body: { execution_type: 'REGRESSION', only_assigned: true },
      },
    ),

  saveResult: (testCaseId: number, input: SaveExecutionInput) =>
    apiFetch<{ ok: true; execution_id?: number }>(`/api/test-cases/${testCaseId}`, {
      method: 'PUT',
      body: input,
    }),

  uploadEvidence: ({ file, testCaseId, category }: EvidenceUploadInput) => {
    const formData = new FormData();
    formData.append('evidence', file);
    formData.append('tc_id', String(testCaseId));
    formData.append('category', category);

    return apiFetch<{ ok: true; id: number }>('/api/evidence', {
      method: 'POST',
      body: formData,
    });
  },

  deleteEvidence: (attachmentId: number) =>
    apiFetch<{ ok: true }>(`/api/evidence/${attachmentId}`, { method: 'DELETE' }),

  /** Defectos de la ejecución del TC (para mostrar los ya reportados). */
  runBugs: (runId: number) =>
    apiFetch<{ bugs?: Defect[] }>(`/api/runs/${runId}/bugs`),
};
