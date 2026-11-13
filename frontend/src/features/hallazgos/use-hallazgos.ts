import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  evidenceApi,
  hallazgosApi,
  suggestionsApi,
  type HallazgoInput,
  type HallazgoPatch,
  type SuggestionInput,
  type SuggestionPatch,
} from '@/lib/api/hallazgos';
import { queryKeys } from '@/lib/query-keys';

export function useHallazgos(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.hallazgos(projectId),
    queryFn: () => hallazgosApi.list(projectId as number),
    enabled: projectId != null,
    select: (data) => data.hallazgos ?? [],
    staleTime: 20_000,
  });
}

export function useSuggestions(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.suggestions(projectId),
    queryFn: () => suggestionsApi.list(projectId as number),
    enabled: projectId != null,
    select: (data) => data.suggestions ?? [],
    staleTime: 20_000,
  });
}

export function useHallazgoMutations(projectId: number | null) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.hallazgos(projectId) });

  const create = useMutation({
    mutationFn: (input: HallazgoInput) =>
      hallazgosApi.create({ ...input, project_id: projectId ?? undefined }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Hallazgo creado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: HallazgoPatch }) =>
      hallazgosApi.update(id, patch),
    onSuccess: async () => {
      await invalidate();
      toast.success('Hallazgo actualizado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => hallazgosApi.remove(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Hallazgo eliminado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      hallazgosApi.setStatus(id, status),
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['hallazgo-status-history'] });
      toast.success('Estado actualizado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assign = useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: number | null }) =>
      hallazgosApi.assign(id, userId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Asignación actualizada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const convertToTestCase = useMutation({
    mutationFn: ({ id, suiteId }: { id: number; suiteId: number }) =>
      hallazgosApi.convertToTestCase(id, suiteId),
    onSuccess: async (result) => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['test-suites', projectId] });
      toast.success(`Test case ${result.key_id ?? ''} creado desde el hallazgo`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { create, update, remove, setStatus, assign, convertToTestCase };
}

export function useSuggestionMutations(projectId: number | null) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.suggestions(projectId) });

  const create = useMutation({
    mutationFn: (input: SuggestionInput) =>
      suggestionsApi.create({ ...input, project_id: projectId ?? undefined }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Sugerencia creada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: SuggestionPatch }) =>
      suggestionsApi.update(id, patch),
    onSuccess: async () => {
      await invalidate();
      toast.success('Sugerencia actualizada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => suggestionsApi.remove(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Sugerencia eliminada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      suggestionsApi.setStatus(id, status),
    onSuccess: async () => {
      await invalidate();
      toast.success('Estado actualizado');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assign = useMutation({
    mutationFn: ({ id, userId }: { id: number; userId: number | null }) =>
      suggestionsApi.assign(id, userId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Asignación actualizada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { create, update, remove, setStatus, assign };
}

/** Evidencias de un hallazgo (defect) o de una sugerencia. */
export function useEvidence(kind: 'defect' | 'suggestion', id: number | null) {
  return useQuery({
    queryKey:
      kind === 'defect' ? queryKeys.hallazgoEvidence(id) : queryKeys.suggestionEvidence(id),
    queryFn: async () => {
      const result =
        kind === 'defect'
          ? await hallazgosApi.evidence(id as number)
          : await suggestionsApi.evidence(id as number);
      return result.evidence ?? [];
    },
    enabled: id != null,
    staleTime: 15_000,
  });
}

export function useEvidenceMutations(
  projectId: number | null,
  kind: 'defect' | 'suggestion',
  id: number | null,
) {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: kind === 'defect' ? queryKeys.hallazgoEvidence(id) : queryKeys.suggestionEvidence(id),
    });
    await queryClient.invalidateQueries({
      queryKey:
        kind === 'defect'
          ? queryKeys.hallazgos(projectId)
          : queryKeys.suggestions(projectId),
    });
  };

  const upload = useMutation({
    mutationFn: ({ file, category }: { file: File; category: string }) =>
      evidenceApi.upload({
        file,
        category,
        ...(kind === 'defect'
          ? { defectId: id as number }
          : { suggestionId: id as number }),
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Evidencia adjuntada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeEvidence = useMutation({
    mutationFn: (attachmentId: number) => evidenceApi.remove(attachmentId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Evidencia eliminada');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { upload, removeEvidence };
}
