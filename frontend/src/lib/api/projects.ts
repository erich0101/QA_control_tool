import { apiFetch } from './client';
import type { Project } from './types';

export type ProjectInput = Pick<Project, 'name'> & Partial<Pick<Project, 'description' | 'status'>>;

/** Configuración de Jira compartida por el proyecto (admin). */
export interface JiraProjectConfig {
  jira_domain: string;
  jira_project_key: string;
}

export interface JiraConfigResponse {
  config: JiraProjectConfig | null;
  /** Si el usuario logueado ya guardó su token para este proyecto. */
  userHasToken: boolean;
}

/** Credenciales propias del usuario (el token nunca vuelve del backend). */
export interface JiraUserConfigResponse {
  hasConfig: boolean;
  email?: string;
}

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
    apiFetch<JiraConfigResponse>(`/api/projects/${id}/jira-config`),

  /** Guarda dominio + key del proyecto (requiere admin o `can_configure_jira`). */
  saveJiraConfig: (id: number, input: JiraProjectConfig) =>
    apiFetch<{ ok: true }>(`/api/projects/${id}/jira-config`, { method: 'POST', body: input }),

  /** Credenciales del usuario actual (email; el token no se devuelve). */
  jiraUserConfig: (id: number) =>
    apiFetch<JiraUserConfigResponse>(`/api/projects/${id}/jira-user-config`),

  saveJiraUserConfig: (id: number, input: { jira_user_email: string; jira_api_token: string }) =>
    apiFetch<{ ok: true }>(`/api/projects/${id}/jira-user-config`, { method: 'POST', body: input }),

  deleteJiraUserConfig: (id: number) =>
    apiFetch<{ ok: true }>(`/api/projects/${id}/jira-user-config`, { method: 'DELETE' }),

  /**
   * Prueba real de conexión (`force_test=1` hace que el backend valide las
   * credenciales guardadas contra Jira en vez de usar caché).
   */
  testJiraConnection: (id: number) =>
    apiFetch<unknown>(`/api/jira/projects/${id}/context`, { query: { force_test: 1 } }),

  jiraContext: (id: number) =>
    apiFetch<{ epics: Array<{ key: string; name: string }> } | { error: string }>(
      `/api/jira/projects/${id}/context`,
    ),
};
