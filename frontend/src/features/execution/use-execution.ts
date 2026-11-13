import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { executionApi, type EvidenceUploadInput, type SaveExecutionInput } from '@/lib/api/execution';
import { queryKeys } from '@/lib/query-keys';

/**
 * Mutaciones del modo Ejecución.
 * Todas invalidan la query de suites del proyecto: el árbol, los estados y los
 * timers salen de la misma fuente (`/api/test-suites`).
 */
export function useExecutionMutations(projectId: number | null) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.testSuites(projectId) }),
      queryClient.invalidateQueries({ queryKey: ['tc-status-history'] }),
    ]);

  const pause = useMutation({
    mutationFn: (runId: number) => executionApi.pauseRun(runId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Ciclo pausado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resume = useMutation({
    mutationFn: (runId: number) => executionApi.resumeRun(runId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Ciclo reanudado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const finish = useMutation({
    mutationFn: (suiteId: number) => executionApi.finishRun(suiteId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Ciclo finalizado y guardado en el histórico');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startAll = useMutation({
    mutationFn: (useCaseId: number) => executionApi.startAllUseCase(useCaseId),
    onSuccess: async (result) => {
      await invalidate();
      toast.success(
        `Caso de uso iniciado: ${result.executedSuites ?? 0} suites, ${result.totalTests ?? 0} tests`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveResult = useMutation({
    mutationFn: ({ id, input }: { id: number; input: SaveExecutionInput }) =>
      executionApi.saveResult(id, input),
    onSuccess: async () => {
      await invalidate();
      toast.success('Resultado guardado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadEvidence = useMutation({
    mutationFn: (input: EvidenceUploadInput) => executionApi.uploadEvidence(input),
    onSuccess: async () => {
      await invalidate();
      toast.success('Evidencia adjuntada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteEvidence = useMutation({
    mutationFn: (attachmentId: number) => executionApi.deleteEvidence(attachmentId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Evidencia eliminada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { pause, resume, finish, startAll, saveResult, uploadEvidence, deleteEvidence };
}
