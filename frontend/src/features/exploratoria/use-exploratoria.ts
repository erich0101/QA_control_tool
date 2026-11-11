import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { exploratoriaApi, type StartSessionInput } from '@/lib/api/exploratoria';
import { queryKeys } from '@/lib/query-keys';

export function useExploratorySessions(projectId: number | null, status: 'RUNNING' | 'FINISHED') {
  return useQuery({
    queryKey: queryKeys.exploratorySessions(projectId, status),
    queryFn: () => exploratoriaApi.listSessions(projectId as number, status),
    enabled: projectId != null,
    select: (data) => data.sessions ?? [],
    staleTime: 15_000,
  });
}

export function useExploratorySession(runId: number | null) {
  return useQuery({
    queryKey: queryKeys.exploratorySession(runId),
    queryFn: () => exploratoriaApi.getSession(runId as number),
    enabled: runId != null,
    staleTime: 10_000,
  });
}

export function useExploratoriaMutations(projectId: number | null, runId: number | null) {
  const queryClient = useQueryClient();

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.exploratorySession(runId) });
    await queryClient.invalidateQueries({
      queryKey: ['exploratory-sessions', projectId],
    });
  };

  const startSession = useMutation({
    mutationFn: (input: StartSessionInput) => exploratoriaApi.startSession(input),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Sesión creada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addFlow = useMutation({
    mutationFn: ({ id, input }: { id: number; input: { title: string; steps?: string; expected_result?: string } }) =>
      exploratoriaApi.addFlow(id, input),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Flujo agregado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const executeFlow = useMutation({
    mutationFn: ({ tcId, input }: { tcId: number; input: Parameters<typeof exploratoriaApi.executeFlow>[1] }) =>
      exploratoriaApi.executeFlow(tcId, input),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Flujo guardado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const finishSession = useMutation({
    mutationFn: (id: number) => exploratoriaApi.finishSession(id),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Sesión finalizada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadEvidence = useMutation({
    mutationFn: exploratoriaApi.uploadEvidence,
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Evidencia adjuntada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteEvidence = useMutation({
    mutationFn: (id: number) => exploratoriaApi.deleteEvidence(id),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Evidencia eliminada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { startSession, addFlow, executeFlow, finishSession, uploadEvidence, deleteEvidence };
}
