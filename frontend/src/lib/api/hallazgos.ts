import { apiFetch } from './client';
import type { EvidenceItem, Hallazgo, Suggestion } from './types';

export interface HallazgoInput {
  project_id?: number;
  title: string;
  description?: string;
  severity?: string;
  steps_to_reproduce?: string;
  expected_result?: string;
  actual_result?: string;
  frequency?: string;
  business_impact?: string;
  preconditions?: string;
  observations?: string;
  assigned_to?: number | null;
  jira_epic_key?: string;
  component?: string;
}

export type HallazgoPatch = Omit<HallazgoInput, 'project_id' | 'title'> & { title?: string };

export interface SuggestionInput {
  project_id?: number;
  title: string;
  category?: string;
  description?: string;
  proposed_solution?: string;
  priority?: string;
  assigned_to?: number | null;
}

export type SuggestionPatch = Omit<SuggestionInput, 'project_id' | 'title'> & { title?: string };

export const hallazgosApi = {
  list: (projectId: number) =>
    apiFetch<{ hallazgos: Hallazgo[] }>('/api/hallazgos', { query: { project_id: projectId } }),

  create: (input: HallazgoInput) =>
    apiFetch<{ ok: true; id: number }>('/api/hallazgos', { method: 'POST', body: input }),

  update: (id: number, patch: HallazgoPatch) =>
    apiFetch<{ ok: true }>(`/api/hallazgos/${id}`, { method: 'PUT', body: patch }),

  remove: (id: number) => apiFetch<{ ok: true }>(`/api/hallazgos/${id}`, { method: 'DELETE' }),

  setStatus: (id: number, status: string) =>
    apiFetch<{ ok: true }>(`/api/hallazgos/${id}/status`, { method: 'PUT', body: { status } }),

  assign: (id: number, assignedTo: number | null) =>
    apiFetch<{ ok: true }>(`/api/hallazgos/${id}/assign`, {
      method: 'PUT',
      body: { assigned_to: assignedTo },
    }),

  convertToTestCase: (id: number, suiteId: number) =>
    apiFetch<{ ok: true; tc_id?: number; key_id?: string }>(
      `/api/hallazgos/${id}/convert-to-tc`,
      { method: 'POST', body: { suite_id: suiteId } },
    ),

  evidence: (id: number) =>
    apiFetch<{ evidence: EvidenceItem[] }>(`/api/hallazgos/${id}/evidence`),
};

export const suggestionsApi = {
  list: (projectId: number) =>
    apiFetch<{ suggestions: Suggestion[] }>('/api/suggestions', {
      query: { project_id: projectId },
    }),

  create: (input: SuggestionInput) =>
    apiFetch<{ ok: true; id: number }>('/api/suggestions', { method: 'POST', body: input }),

  update: (id: number, patch: SuggestionPatch) =>
    apiFetch<{ ok: true }>(`/api/suggestions/${id}`, { method: 'PUT', body: patch }),

  remove: (id: number) => apiFetch<{ ok: true }>(`/api/suggestions/${id}`, { method: 'DELETE' }),

  setStatus: (id: number, status: string) =>
    apiFetch<{ ok: true }>(`/api/suggestions/${id}/status`, { method: 'PUT', body: { status } }),

  assign: (id: number, assignedTo: number | null) =>
    apiFetch<{ ok: true }>(`/api/suggestions/${id}/assign`, {
      method: 'PUT',
      body: { assigned_to: assignedTo },
    }),

  evidence: (id: number) =>
    apiFetch<{ evidence: EvidenceItem[] }>(`/api/suggestions/${id}/evidence`),
};

/** Evidencias: el backend distingue el dueño por `defect_id` o `suggestion_id`. */
export const evidenceApi = {
  upload: ({
    file,
    category,
    defectId,
    suggestionId,
  }: {
    file: File;
    category: string;
    defectId?: number;
    suggestionId?: number;
  }) => {
    const formData = new FormData();
    formData.append('evidence', file);
    formData.append('category', category);
    if (defectId) formData.append('defect_id', String(defectId));
    if (suggestionId) formData.append('suggestion_id', String(suggestionId));

    return apiFetch<{ ok: true; id: number }>('/api/evidence', {
      method: 'POST',
      body: formData,
    });
  },

  remove: (id: number) => apiFetch<{ ok: true }>(`/api/evidence/${id}`, { method: 'DELETE' }),
};
