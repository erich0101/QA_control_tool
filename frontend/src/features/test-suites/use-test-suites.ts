import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { projectsApi } from '@/lib/api/projects';
import {
  testSuitesApi,
  type TestCaseInput,
  type TestSuiteInput,
} from '@/lib/api/test-suites';
import type { TestCasePatch } from '@/lib/api/types';
import { queryKeys } from '@/lib/query-keys';

// El equipo vive en features/team; se reexporta para no romper imports.
export { useTeam } from '@/features/team/use-team';

export function useTestSuites(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.testSuites(projectId),
    queryFn: () => testSuitesApi.listByProject(projectId as number),
    enabled: projectId != null,
    select: (data) => data.testSuites ?? [],
    staleTime: 20_000,
  });
}

/**
 * Épicas de Jira para el selector de TC/Suite.
 * Si el proyecto no tiene token configurado el backend devuelve `error`:
 * en ese caso la lista queda vacía y no se molesta al usuario con un toast.
 */
export function useJiraEpics(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.jiraContext(projectId),
    queryFn: async () => {
      try {
        const context = await projectsApi.jiraContext(projectId as number);
        if ('error' in context) return [];
        return context.epics ?? [];
      } catch {
        return [];
      }
    },
    enabled: projectId != null,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

function useInvalidateSuites(projectId: number | null) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.testSuites(projectId) });
}

export function useSuiteMutations(projectId: number | null) {
  const invalidate = useInvalidateSuites(projectId);

  const create = useMutation({
    mutationFn: (input: TestSuiteInput) => testSuitesApi.create(input),
    onSuccess: async () => {
      await invalidate();
      toast.success('Suite creada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<TestSuiteInput> }) =>
      testSuitesApi.update(id, input),
    onSuccess: async () => {
      await invalidate();
      toast.success('Suite actualizada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      testSuitesApi.setActive(id, isActive),
    onSuccess: async (_data, variables) => {
      await invalidate();
      toast.success(
        variables.isActive ? 'Suite incluida en cobertura' : 'Suite fuera del gap de pruebas',
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => testSuitesApi.remove(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Suite eliminada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignAll = useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: number | null }) =>
      testSuitesApi.assignAll(id, userId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Tests asignados');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startRun = useMutation({
    mutationFn: (id: number) => testSuitesApi.startRun(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Ciclo de ejecución iniciado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startTestCase = useMutation({
    mutationFn: (id: number) => testSuitesApi.startTestCase(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Ejecución individual iniciada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { create, update, setActive, remove, assignAll, startRun, startTestCase };
}

export function useTestCaseMutations(projectId: number | null) {
  const invalidate = useInvalidateSuites(projectId);

  const create = useMutation({
    mutationFn: (input: TestCaseInput) => testSuitesApi.testCases.create(input),
    onSuccess: async () => {
      await invalidate();
      toast.success('Test case creado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TestCasePatch }) =>
      testSuitesApi.testCases.update(id, patch),
    onSuccess: async () => {
      await invalidate();
      toast.success('Test case actualizado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => testSuitesApi.testCases.remove(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Test case eliminado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const move = useMutation({
    mutationFn: ({ id, suiteId }: { id: number; suiteId: number }) =>
      testSuitesApi.testCases.move(id, suiteId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Test case movido');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { create, update, remove, move };
}

export function useSuiteInconsistencies(projectId: number | null) {
  const invalidate = useInvalidateSuites(projectId);

  const create = useMutation({
    mutationFn: (input: {
      suite_id: number;
      title: string;
      description?: string;
      severity?: string;
    }) => testSuitesApi.inconsistencies.create(input),
    onSuccess: async () => {
      await invalidate();
      toast.success('Inconsistencia agregada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => testSuitesApi.inconsistencies.remove(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Inconsistencia resuelta');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { create, remove };
}
