import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { defectsApi, historyApi } from '@/lib/api/history';
import { queryKeys } from '@/lib/query-keys';

export function useHistoryRuns(projectId: number | null, page: number) {
  return useQuery({
    queryKey: queryKeys.history(projectId, page),
    queryFn: () => historyApi.listRuns(projectId as number, page),
    enabled: projectId != null,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

/**
 * Defectos del proyecto + estado actual en Jira (si hay token configurado).
 * El merge se hace acá para que la vista de Bugs reciba todo listo.
 */
export function useProjectDefects(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.defects(projectId),
    queryFn: async () => {
      const [{ defects }] = await Promise.all([defectsApi.list(projectId as number)]);

      try {
        const { statuses } = await defectsApi.jiraStatus(projectId as number);
        return defects.map((defect) =>
          defect.jira_key && statuses?.[defect.jira_key]
            ? {
                ...defect,
                jira_status: statuses[defect.jira_key].status,
              }
            : defect,
        );
      } catch {
        // Sin token de Jira o API caída: mostramos los defectos locales igual.
        return defects;
      }
    },
    enabled: projectId != null,
    staleTime: 30_000,
  });
}

export function useRunBugs(runId: number | null) {
  return useQuery({
    queryKey: queryKeys.runBugs(runId),
    queryFn: () => historyApi.runBugs(runId as number),
    enabled: runId != null,
    select: (data) => data.bugs ?? [],
    staleTime: 60_000,
  });
}

export function useHistoryMutations(projectId: number | null) {
  const queryClient = useQueryClient();

  const retest = useMutation({
    mutationFn: (runId: number) => historyApi.retest(runId),
    onSuccess: () => {
      // El retest crea un ciclo activo: impacta tanto el historial como Ejecución.
      queryClient.invalidateQueries({ queryKey: ['history', projectId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.testSuites(projectId) });
      toast.success('Ciclo de retesting iniciado — miralo en Ejecución');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dismiss = useMutation({
    mutationFn: ({ id, dismissed }: { id: number; dismissed: boolean }) =>
      defectsApi.dismiss(id, dismissed),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.defects(projectId) });
      toast.success(variables.dismissed ? 'Bug descartado' : 'Bug reabierto');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { retest, dismiss };
}
