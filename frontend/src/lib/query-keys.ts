/**
 * Claves de TanStack Query en un solo lugar.
 * Evita strings duplicados y facilita invalidar por prefijo.
 */
export const queryKeys = {
  session: ['session'] as const,
  projects: ['projects'] as const,
  useCases: (projectId: number | null) => ['use-cases', projectId] as const,
  userStories: (useCaseId: number | null) => ['user-stories', useCaseId] as const,
  testSuites: (projectId: number | null, useCaseId?: number) =>
    ['test-suites', projectId, useCaseId ?? null] as const,
  users: ['users'] as const,
  jiraConfig: (projectId: number) => ['jira-config', projectId] as const,
  jiraContext: (projectId: number | null) => ['jira-context', projectId] as const,
  history: (projectId: number | null, page: number) => ['history', projectId, page] as const,
  defects: (projectId: number | null) => ['defects', projectId] as const,
  runBugs: (runId: number | null) => ['run-bugs', runId] as const,
  hallazgos: (projectId: number | null) => ['hallazgos', projectId] as const,
  suggestions: (projectId: number | null) => ['suggestions', projectId] as const,
  hallazgoEvidence: (id: number | null) => ['hallazgo-evidence', id] as const,
  suggestionEvidence: (id: number | null) => ['suggestion-evidence', id] as const,
  exploratorySessions: (projectId: number | null, status: string) =>
    ['exploratory-sessions', projectId, status] as const,
  exploratorySession: (runId: number | null) => ['exploratory-session', runId] as const,
  myJiraTickets: (projectId: number | null, filter: string) =>
    ['my-jira-tickets', projectId, filter] as const,
  jiraTracking: (projectId: number | null) => ['jira-tracking', projectId] as const,
  jiraComments: (projectId: number | null, issueKey: string | null) =>
    ['jira-comments', projectId, issueKey] as const,
  overviewStats: (projectId: number | null) => ['stats-overview', projectId] as const,
  suiteStats: (projectId: number | null, from: string, to: string) =>
    ['stats-suites', projectId, from, to] as const,
  jiraDaily: (projectId: number | null) => ['stats-jira-daily', projectId] as const,
  jiraProductivity: (projectId: number | null) => ['stats-jira-productivity', projectId] as const,
  epicReport: (projectId: number | null, epicKey: string | null, from: string, to: string) =>
    ['epic-report', projectId, epicKey, from, to] as const,
};
