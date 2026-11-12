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

/** Contexto que devuelve `/api/jira/projects/:id/context` para crear tickets. */
export interface JiraContextEpic {
  id: string;
  key: string;
  summary: string;
  name?: string;
}

export interface JiraContextUser {
  accountId: string;
  displayName: string;
}

export interface JiraContextPriority {
  id: string;
  name: string;
}

export interface JiraContextCustomField {
  fieldId: string;
  name: string;
  required?: boolean;
  schemaType?: string;
  options?: Array<{ id: string; name: string; value?: string }>;
}

export interface JiraTicketContext {
  epics: JiraContextEpic[];
  users: JiraContextUser[];
  priorities: JiraContextPriority[];
  customFields: JiraContextCustomField[];
}

export interface JiraTicketPayload {
  epicId?: string | null;
  assigneeId?: string | null;
  priorityId?: string | null;
  customFields?: Record<string, unknown>;
}

export interface JiraTicketResult {
  ok: true;
  jira: { id: string; key: string; self: string; browser_url: string };
  attachment_count: number;
  attachment_errors: Array<{ file: string; error: string }>;
}

export const jiraApi = {
  myTickets: (projectId: number, filter: MyJiraFilter, maxResults = 50) =>
    apiFetch<{ total: number; tickets: JiraTicket[] }>(
      `/api/jira/projects/${projectId}/my-tickets`,
      { query: { filter, maxResults } },
    ),

  /** Contexto completo para crear tickets (épicas, asignados, prioridades). */
  context: (projectId: number) =>
    apiFetch<JiraTicketContext>(`/api/jira/projects/${projectId}/context`),

  /** Crea el ticket de un bug (defecto con ejecución). */
  createDefectTicket: (defectId: number, payload: JiraTicketPayload) =>
    apiFetch<JiraTicketResult>(`/api/jira/defects/${defectId}/create-ticket`, {
      method: 'POST',
      body: payload,
    }),

  /** Crea el ticket de un hallazgo (defecto sin ejecución). */
  createHallazgoTicket: (hallazgoId: number, payload: JiraTicketPayload) =>
    apiFetch<JiraTicketResult>(`/api/jira/hallazgos/${hallazgoId}/create-ticket`, {
      method: 'POST',
      body: payload,
    }),

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
