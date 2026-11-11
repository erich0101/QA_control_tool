import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  useCasesApi,
  userStoriesApi,
  type UseCaseInput,
  type UserStoryInput,
  type UserStoryPatch,
} from '@/lib/api/use-cases';
import { queryKeys } from '@/lib/query-keys';

export function useUseCases(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.useCases(projectId),
    queryFn: () => useCasesApi.list(projectId as number),
    enabled: projectId != null,
    select: (data) => data.useCases ?? [],
    staleTime: 30_000,
  });
}

export function useUserStories(useCaseId: number | null) {
  return useQuery({
    queryKey: queryKeys.userStories(useCaseId),
    queryFn: () => userStoriesApi.list(useCaseId as number),
    enabled: useCaseId != null,
    select: (data) => data.userStories ?? [],
    staleTime: 30_000,
  });
}

/** Invalida las queries que dependen de una HU (lista + contadores de CU). */
function useInvalidateStories(projectId: number | null, useCaseId: number | null) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.userStories(useCaseId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.useCases(projectId) }),
    ]);
  };
}

export function useCreateUseCase(projectId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UseCaseInput) => useCasesApi.create({ ...input, project_id: projectId ?? undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.useCases(projectId) });
      toast.success('Caso de uso creado');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateUseCase(projectId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<UseCaseInput> }) =>
      useCasesApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.useCases(projectId) });
      toast.success('Caso de uso actualizado');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteUseCase(projectId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => useCasesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.useCases(projectId) });
      queryClient.removeQueries({ queryKey: ['user-stories'] });
      toast.success('Caso de uso eliminado');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useCreateUserStory(projectId: number | null, useCaseId: number | null) {
  const invalidate = useInvalidateStories(projectId, useCaseId);

  return useMutation({
    mutationFn: (input: UserStoryInput) => userStoriesApi.create(input),
    onSuccess: async () => {
      await invalidate();
      toast.success('Historia de usuario creada');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateUserStory(projectId: number | null, useCaseId: number | null) {
  const invalidate = useInvalidateStories(projectId, useCaseId);

  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UserStoryPatch }) =>
      userStoriesApi.update(id, patch),
    onSuccess: async () => {
      await invalidate();
      toast.success('Cambios guardados');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteUserStory(projectId: number | null, useCaseId: number | null) {
  const invalidate = useInvalidateStories(projectId, useCaseId);

  return useMutation({
    mutationFn: (id: number) => userStoriesApi.remove(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Historia de usuario eliminada');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Escenarios e inconsistencias comparten invalidación por HU. */
export function useStoryChildren(projectId: number | null, useCaseId: number | null) {
  const invalidate = useInvalidateStories(projectId, useCaseId);

  const createScenario = useMutation({
    mutationFn: (input: { us_id: number; title: string; order_index?: number }) =>
      userStoriesApi.scenarios.create(input),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const updateScenario = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      userStoriesApi.scenarios.update(id, { title }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteScenario = useMutation({
    mutationFn: (id: number) => userStoriesApi.scenarios.remove(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Escenario eliminado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteInconsistency = useMutation({
    mutationFn: (id: number) => userStoriesApi.inconsistencies.remove(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Inconsistencia resuelta');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { createScenario, updateScenario, deleteScenario, deleteInconsistency };
}
