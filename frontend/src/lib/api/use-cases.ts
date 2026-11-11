import { apiFetch } from './client';
import type { Inconsistency, Scenario, UseCase, UserStory } from './types';

export interface UseCaseInput {
  project_id?: number;
  key_id?: string;
  title: string;
  description?: string;
}

export interface UserStoryInput {
  use_case_id?: number;
  key_id?: string;
  title: string;
  hu_detallada?: string;
  status?: string;
  priority?: string;
}

/** Campos editables de una HU (los que acepta el PUT del backend). */
export type UserStoryPatch = Partial<
  Pick<
    UserStory,
    | 'title'
    | 'status'
    | 'priority'
    | 'key_id'
    | 'hu_detallada'
    | 'escenarios_prueba'
    | 'reglas_negocio'
    | 'precondiciones'
    | 'link_documentacion'
    | 'recommendations'
  >
>;

export const useCasesApi = {
  list: (projectId: number) =>
    apiFetch<{ useCases: UseCase[] }>('/api/use-cases', { query: { project_id: projectId } }),

  create: (input: UseCaseInput) =>
    apiFetch<{ ok: true; id: number; key_id: string }>('/api/use-cases', {
      method: 'POST',
      body: input,
    }),

  update: (id: number, input: Partial<UseCaseInput>) =>
    apiFetch<{ ok: true }>(`/api/use-cases/${id}`, { method: 'PUT', body: input }),

  remove: (id: number) => apiFetch<{ ok: true }>(`/api/use-cases/${id}`, { method: 'DELETE' }),
};

export const userStoriesApi = {
  list: (useCaseId: number) =>
    apiFetch<{ userStories: UserStory[] }>('/api/user-stories', {
      query: { use_case_id: useCaseId },
    }),

  create: (input: UserStoryInput) =>
    apiFetch<{ ok: true; id: number; key_id: string }>('/api/user-stories', {
      method: 'POST',
      body: input,
    }),

  update: (id: number, patch: UserStoryPatch) =>
    apiFetch<{ ok: true }>(`/api/user-stories/${id}`, { method: 'PUT', body: patch }),

  remove: (id: number) =>
    apiFetch<{ ok: true }>(`/api/user-stories/${id}`, { method: 'DELETE' }),

  scenarios: {
    create: (input: { us_id: number; title: string; order_index?: number }) =>
      apiFetch<{ ok: true; id: number }>('/api/scenarios', { method: 'POST', body: input }),

    update: (id: number, patch: Partial<Pick<Scenario, 'title' | 'description' | 'order_index'>>) =>
      apiFetch<{ ok: true }>(`/api/scenarios/${id}`, { method: 'PUT', body: patch }),

    remove: (id: number) => apiFetch<{ ok: true }>(`/api/scenarios/${id}`, { method: 'DELETE' }),
  },

  inconsistencies: {
    remove: (id: number) =>
      apiFetch<{ ok: true }>(`/api/inconsistencies/${id}`, { method: 'DELETE' }),
  },
};

export type { Inconsistency, Scenario };
