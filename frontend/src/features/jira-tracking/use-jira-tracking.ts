import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { jiraApi } from '@/lib/api/jira';
import { defectsApi } from '@/lib/api/history';
import { hallazgosApi } from '@/lib/api/hallazgos';
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

/**
 * Cambia el estado local del origen del ticket (bug o hallazgo) desde la
 * trazabilidad. Marcar un bug como FIXED/CLOSED lo saca del universo "abierto"
 * del reporte de estatus, sin eliminarlo del reporte de bugs.
 */
export function useSetTrackingOriginStatus(projectId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      origin,
      id,
      status,
    }: {
      origin: 'bug' | 'hallazgo' | undefined;
      id: number;
      status: string;
    }) =>
      origin === 'hallazgo'
        ? hallazgosApi.setStatus(id, status)
        : defectsApi.setStatus(id, status),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.jiraTracking(projectId) }),
        variables.origin === 'hallazgo'
          ? queryClient.invalidateQueries({ queryKey: queryKeys.hallazgos(projectId) })
          : queryClient.invalidateQueries({ queryKey: queryKeys.defects(projectId) }),
      ]);
      const entity = variables.origin === 'hallazgo' ? 'Hallazgo' : 'Bug';
      toast.success(
        variables.status === 'FIXED'
          ? `${entity} marcado como resuelto: ya no cuenta como abierto en el reporte de estatus`
          : `${entity} reabierto: vuelve a contar como abierto en el reporte de estatus`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
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
