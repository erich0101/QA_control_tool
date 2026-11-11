import { apiFetch } from './client';
import type { Inconsistency, TestCase, TestCasePatch, TestSuite } from './types';

export interface TestSuiteInput {
  use_case_id: number;
  title: string;
  description?: string;
  jira_epic_key?: string;
}

export interface TestCaseInput {
  suite_id: number;
  us_id?: number | null;
  title: string;
  steps?: string;
  expected_result?: string;
  preconditions?: string;
  assigned_to?: number | null;
  priority?: string;
  jira_epic_key?: string;
}

export const testSuitesApi = {
  /** Trae todas las suites del proyecto con TCs e inconsistencias ya hidratados. */
  listByProject: (projectId: number) =>
    apiFetch<{ testSuites: TestSuite[] }>('/api/test-suites', { query: { project_id: projectId } }),

  listByUseCase: (useCaseId: number) =>
    apiFetch<{ testSuites: TestSuite[] }>('/api/test-suites', { query: { use_case_id: useCaseId } }),

  create: (input: TestSuiteInput) =>
    apiFetch<{ ok: true; id: number; key_id: string }>('/api/test-suites', {
      method: 'POST',
      body: input,
    }),

  update: (id: number, input: Partial<TestSuiteInput>) =>
    apiFetch<{ ok: true }>(`/api/test-suites/${id}`, { method: 'PUT', body: input }),

  setActive: (id: number, isActive: boolean) =>
    apiFetch<{ ok: true }>(`/api/test-suites/${id}/active`, {
      method: 'PUT',
      body: { is_active: isActive },
    }),

  remove: (id: number) => apiFetch<{ ok: true }>(`/api/test-suites/${id}`, { method: 'DELETE' }),

  assignAll: (id: number, userId: number | null) =>
    apiFetch<{ ok: true }>(`/api/test-suites/${id}/assign-all`, {
      method: 'PUT',
      body: { assigned_to: userId },
    }),

  updateInconsistencies: (id: number, inconsistencies: unknown[]) =>
    apiFetch<{ ok: true }>(`/api/test-suites/${id}/inconsistencies`, {
      method: 'PUT',
      body: { inconsistencies },
    }),

  startRun: (id: number) =>
    apiFetch<{ ok: true; run_id?: number }>(`/api/test-suites/${id}/start-execution`, {
      method: 'POST',
      body: { execution_type: 'FULL', filters: null, only_assigned: false },
    }),

  finishRun: (id: number) =>
    apiFetch<{ ok: true }>(`/api/test-suites/${id}/finish-execution`, { method: 'POST' }),

  startTestCase: (id: number) =>
    apiFetch<{ ok: true; run_id?: number }>(`/api/test-cases/${id}/start-execution`, {
      method: 'POST',
    }),

  testCases: {
    create: (input: TestCaseInput) =>
      apiFetch<{ ok: true; id: number; key_id: string }>('/api/test-cases', {
        method: 'POST',
        body: input,
      }),

    update: (id: number, patch: TestCasePatch) =>
      apiFetch<{ ok: true }>(`/api/test-cases/${id}`, { method: 'PUT', body: patch }),

    remove: (id: number) => apiFetch<{ ok: true }>(`/api/test-cases/${id}`, { method: 'DELETE' }),

    move: (id: number, newSuiteId: number) =>
      apiFetch<{ ok: true }>(`/api/test-cases/${id}/move`, {
        method: 'PUT',
        body: { new_suite_id: newSuiteId },
      }),
  },

  inconsistencies: {
    create: (input: { suite_id: number; title: string; description?: string; severity?: string }) =>
      apiFetch<{ ok: true; id: number }>('/api/inconsistencies', { method: 'POST', body: input }),

    remove: (id: number) =>
      apiFetch<{ ok: true }>(`/api/inconsistencies/${id}`, { method: 'DELETE' }),
  },
};

export type { Inconsistency, TestCase, TestSuite };
