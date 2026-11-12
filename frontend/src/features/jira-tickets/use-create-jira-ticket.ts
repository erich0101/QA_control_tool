import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { jiraApi, type JiraTicketPayload } from '@/lib/api/jira';
import { queryKeys } from '@/lib/query-keys';

/** Épicas, asignados, prioridades y campos custom del proyecto en Jira. */
export function useJiraTicketContext(projectId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.jiraContext(projectId), 'tickets'] as const,
    queryFn: () => jiraApi.context(projectId as number),
    enabled: projectId != null && enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export type JiraTicketKind = 'defect' | 'hallazgo';

/**
 * Crea tickets en Jira de a uno. Invalida todo lo que muestra `jira_key`
 * (defectos, hallazgos, bugs de un run, seguimiento y Mi JIRA).
 */
export function useCreateJiraTicket(projectId: number | null, kind: JiraTicketKind) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: JiraTicketPayload }) =>
      kind === 'defect'
        ? jiraApi.createDefectTicket(id, payload)
        : jiraApi.createHallazgoTicket(id, payload),
    onSuccess: () => {
      const prefixes = ['defects', 'hallazgos', 'run-bugs', 'jira-tracking', 'my-jira-tickets'];
      queryClient.invalidateQueries({
        predicate: (query) => prefixes.includes(String(query.queryKey[0])),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.jiraTracking(projectId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
