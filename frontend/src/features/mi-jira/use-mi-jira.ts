import { useQuery, useQueryClient } from '@tanstack/react-query';
import { jiraApi } from '@/lib/api/jira';
import type { MyJiraFilter } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-keys';

export function useMyJiraTickets(projectId: number | null, filter: MyJiraFilter) {
  return useQuery({
    queryKey: queryKeys.myJiraTickets(projectId, filter),
    queryFn: () => jiraApi.myTickets(projectId as number, filter),
    enabled: projectId != null,
    select: (data) => data.tickets ?? [],
    staleTime: 60_000,
    retry: false,
  });
}

export function useRefreshMyJira(projectId: number | null, filter: MyJiraFilter) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.myJiraTickets(projectId, filter) });
}
