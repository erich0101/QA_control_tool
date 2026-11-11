import { apiFetch } from './client';
import type { TestSuite, User } from './types';

export const usersApi = {
  list: () => apiFetch<{ users: User[] }>('/api/users'),
};

export const testSuitesApi = {
  list: (projectId: number, useCaseId?: number) =>
    apiFetch<{ testSuites: TestSuite[] }>('/api/test-suites', {
      query: useCaseId ? { use_case_id: useCaseId } : { project_id: projectId },
    }),
};
