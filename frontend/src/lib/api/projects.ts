import { apiFetch } from './client';
import type { Project } from './types';

export type ProjectInput = Pick<Project, 'name'> & Partial<Pick<Project, 'description' | 'status'>>;

export const projectsApi = {
  list: () => apiFetch<{ projects: Project[] }>('/api/projects'),

  create: (input: ProjectInput) =>
    apiFetch<{ project: Project }>('/api/projects', { method: 'POST', body: input }),

  update: (id: number, input: Partial<ProjectInput>) =>
    apiFetch<{ ok: true }>(`/api/projects/${id}`, { method: 'PUT', body: input }),

  remove: (id: number) => apiFetch<{ ok: true }>(`/api/projects/${id}`, { method: 'DELETE' }),

  exportMatrix: (id: number) => {
    window.location.href = `/api/projects/${id}/export-excel`;
  },

  jiraConfig: (id: number) =>
    apiFetch<{ config: Record<string, unknown> | null; userHasToken: boolean }>(
      `/api/projects/${id}/jira-config`,
    ),

  jiraContext: (id: number) =>
    apiFetch<{ epics: Array<{ key: string; name: string }> } | { error: string }>(
      `/api/jira/projects/${id}/context`,
    ),
};
