import { apiFetch } from './client';
import type { JiraTicket, MyJiraFilter } from './types';

/**
 * Dominio de Jira para los links "Abrir en Jira".
 * Se puede sobreescribir con VITE_JIRA_BASE_URL sin tocar código.
 */
export const JIRA_BASE_URL =
  import.meta.env.VITE_JIRA_BASE_URL ?? 'https://livewareissa.atlassian.net';

export function jiraIssueUrl(key: string): string {
  return `${JIRA_BASE_URL.replace(/\/$/, '')}/browse/${key}`;
}

export const jiraApi = {
  myTickets: (projectId: number, filter: MyJiraFilter, maxResults = 50) =>
    apiFetch<{ total: number; tickets: JiraTicket[] }>(
      `/api/jira/projects/${projectId}/my-tickets`,
      { query: { filter, maxResults } },
    ),

  /** Épicas del proyecto (selector de tickets). */
  context: (projectId: number) =>
    apiFetch<{
      epics?: Array<{ key: string; name: string }>;
      error?: string;
    }>(`/api/jira/projects/${projectId}/context`),
};
