import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { exploratoriaApi, type StartSessionInput } from '@/lib/api/exploratoria';
import { hallazgosApi } from '@/lib/api/hallazgos';
import { testSuitesApi } from '@/lib/api/test-suites';
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

  /**
   * Asigna (o quita) el tester de un flujo PENDING. El tester vive en el test
   * case (`assigned_to`), igual que en la UI legacy: al ejecutar el flujo, el
   * backend lo usa como tester real de la ejecución.
   */
  const assignTester = useMutation({
    mutationFn: ({ tcId, userId }: { tcId: number; userId: number | null }) =>
      testSuitesApi.testCases.update(tcId, { assigned_to: userId }),
    onSuccess: async () => {
      await invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /**
   * Crea un hallazgo dentro de la sesión reutilizando POST /api/hallazgos.
   * Queda vinculado por `exploratory_run_id` y aparece como hallazgo de la
   * sesión (no como flujo ejecutable).
   */
  const addHallazgo = useMutation({
    mutationFn: (input: {
      title: string;
      description?: string;
      severity?: string;
      steps_to_reproduce?: string;
      expected_result?: string;
      actual_result?: string;
    }) =>
      hallazgosApi.create({
        project_id: projectId as number,
        exploratory_run_id: runId,
        ...input,
      }),
    onSuccess: async () => {
      await invalidateAll();
      await queryClient.invalidateQueries({ queryKey: queryKeys.hallazgos(projectId) });
      toast.success('Hallazgo creado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    startSession,
    addFlow,
    executeFlow,
    finishSession,
    uploadEvidence,
    deleteEvidence,
    assignTester,
    addHallazgo,
  };
}
