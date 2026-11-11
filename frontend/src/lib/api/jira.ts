import { apiFetch } from './client';
import type {
  JiraIssueComment,
  JiraTicket,
  JiraTrackingItem,
  MyJiraFilter,
} from './types';

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

  /** Defectos del proyecto con su estado actual en Jira, agrupables por épica. */
  tracking: (projectId: number) =>
    apiFetch<{ tracking: JiraTrackingItem[] }>(`/api/jira/projects/${projectId}/tracking`),

  comments: (projectId: number, issueKey: string) =>
    apiFetch<{ comments: JiraIssueComment[] }>(`/api/jira/issues/${issueKey}/comments`, {
      query: { project_id: projectId },
    }),

  addComment: (projectId: number, issueKey: string, text: string, mentionId?: string | null) =>
    apiFetch<{ ok: true }>(`/api/jira/issues/${issueKey}/comments`, {
      method: 'POST',
      body: { project_id: projectId, text, mentionId: mentionId ?? null },
    }),
};
