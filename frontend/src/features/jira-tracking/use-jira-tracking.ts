import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { jiraApi } from '@/lib/api/jira';
import { queryKeys } from '@/lib/query-keys';

export function useJiraTracking(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.jiraTracking(projectId),
    queryFn: () => jiraApi.tracking(projectId as number),
    enabled: projectId != null,
    select: (data) => data.tracking ?? [],
    staleTime: 60_000,
    retry: false,
  });
}

export function useJiraComments(projectId: number | null, issueKey: string | null) {
  return useQuery({
    queryKey: queryKeys.jiraComments(projectId, issueKey),
    queryFn: () => jiraApi.comments(projectId as number, issueKey as string),
    enabled: projectId != null && issueKey != null,
    select: (data) => data.comments ?? [],
    staleTime: 30_000,
    retry: false,
  });
}

export function useAddJiraComment(projectId: number | null, issueKey: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ text, mentionId }: { text: string; mentionId?: string | null }) =>
      jiraApi.addComment(projectId as number, issueKey as string, text, mentionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.jiraComments(projectId, issueKey),
      });
      toast.success('Comentario agregado en Jira');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
