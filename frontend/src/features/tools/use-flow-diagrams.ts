import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  flowDiagramsApi,
  type FlowDiagramPayload,
} from '@/lib/api/flow-diagrams';
import { queryKeys } from '@/lib/query-keys';

export function useFlowDiagrams(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.flowDiagrams(projectId),
    queryFn: () => flowDiagramsApi.list(projectId as number),
    enabled: projectId != null,
  });
}

export function useFlowDiagram(id: number | null) {
  return useQuery({
    queryKey: queryKeys.flowDiagram(id),
    queryFn: () => flowDiagramsApi.get(id as number),
    enabled: id != null,
  });
}

export function useFlowDiagramMutations(projectId: number | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.flowDiagrams(projectId) });
  };

  const create = useMutation({
    mutationFn: (payload: FlowDiagramPayload) =>
      flowDiagramsApi.create(projectId as number, payload),
    onSuccess: () => {
      invalidate();
      toast.success('Diagrama guardado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: FlowDiagramPayload }) =>
      flowDiagramsApi.update(id, payload),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['flow-diagram'] });
      toast.success('Diagrama actualizado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => flowDiagramsApi.remove(id),
    onSuccess: () => {
      invalidate();
      queryClient.removeQueries({ queryKey: ['flow-diagram'] });
      toast.success('Diagrama eliminado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { create, update, remove };
}
