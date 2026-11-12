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

/** Testers con actividad en el rango, para el modal del reporte de estatus. */
export function useStatusReportTesters(
  projectId: number | null,
  dateFrom: string,
  dateTo: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.exploratoryStatusTesters(projectId, dateFrom, dateTo),
    queryFn: () => exploratoriaApi.statusReportTesters(projectId as number, dateFrom, dateTo),
    enabled: projectId != null && enabled && Boolean(dateFrom) && Boolean(dateTo),
    staleTime: 30_000,
    retry: false,
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

  /** Editar el TC de un flujo (título, pasos y resultado esperado). */
  const updateFlow = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: number;
      input: { title: string; steps?: string; expected_result?: string };
    }) => testSuitesApi.testCases.update(id, input),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Flujo actualizado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Eliminar el TC de un flujo (y su ejecución de la sesión). */
  const removeFlow = useMutation({
    mutationFn: (id: number) => testSuitesApi.testCases.remove(id),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Flujo eliminado');
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

  /** Extiende la fecha límite de la sesión con justificación. */
  const extendDeadline = useMutation({
    mutationFn: ({ id, deadlineAt, reason }: { id: number; deadlineAt: string; reason: string }) =>
      exploratoriaApi.extendDeadline(id, { deadlineAt, reason }),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Fecha límite extendida');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Declara (o quita) que los TC de cobertura están cargados. */
  const setCoverage = useMutation({
    mutationFn: ({ id, ready }: { id: number; ready: boolean }) =>
      exploratoriaApi.setCoverage(id, ready),
    onSuccess: async (result) => {
      await invalidateAll();
      toast.success(
        result.coverage_ready
          ? 'Cobertura de TC declarada'
          : 'Cobertura de TC desmarcada',
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Elimina toda la sesión y sus datos asociados. */  const deleteSession = useMutation({
    mutationFn: (id: number) => exploratoriaApi.deleteSession(id),
    onSuccess: async (result) => {
      await invalidateAll();
      const d = result.deleted;
      toast.success(
        `Sesión eliminada (${d.executions} ejecuciones, ${d.defects + d.hallazgos} defectos/hallazgos)`,
      );
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

  /**
   * Estado y asignación del hallazgo desde el detalle de la sesión,
   * reutilizando PUT /api/hallazgos/:id/{status,assign}.
   */
  const setHallazgoStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      hallazgosApi.setStatus(id, status),
    onSuccess: async () => {
      await invalidateAll();
      await queryClient.invalidateQueries({ queryKey: queryKeys.hallazgos(projectId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignHallazgo = useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: number | null }) =>
      hallazgosApi.assign(id, userId),
    onSuccess: async () => {
      await invalidateAll();
      await queryClient.invalidateQueries({ queryKey: queryKeys.hallazgos(projectId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Editar título/severidad/descripción/pasos/resultados del hallazgo. */
  const updateHallazgo = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: {
        title: string;
        description?: string;
        severity?: string;
        steps_to_reproduce?: string;
        expected_result?: string;
        actual_result?: string;
      };
    }) => hallazgosApi.update(id, patch),
    onSuccess: async () => {
      await invalidateAll();
      await queryClient.invalidateQueries({ queryKey: queryKeys.hallazgos(projectId) });
      toast.success('Hallazgo actualizado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeHallazgo = useMutation({
    mutationFn: (id: number) => hallazgosApi.remove(id),
    onSuccess: async () => {
      await invalidateAll();
      await queryClient.invalidateQueries({ queryKey: queryKeys.hallazgos(projectId) });
      toast.success('Hallazgo eliminado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    startSession,
    addFlow,
    updateFlow,
    removeFlow,
    executeFlow,
    finishSession,
    deleteSession,
    setCoverage,
    extendDeadline,
    uploadEvidence,
    deleteEvidence,
    assignTester,
    addHallazgo,
    updateHallazgo,
    removeHallazgo,
    setHallazgoStatus,
    assignHallazgo,
  };
}
