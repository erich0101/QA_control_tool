import { apiFetch } from './client';
import type { UseCase, UserStory } from './types';

export const useCasesApi = {
  list: (projectId: number) =>
    apiFetch<{ useCases: UseCase[] }>('/api/use-cases', { query: { project_id: projectId } }),

  stories: (useCaseId: number) =>
    apiFetch<{ stories: UserStory[] }>('/api/user-stories', {
      query: { use_case_id: useCaseId },
    }),
};
