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
};
