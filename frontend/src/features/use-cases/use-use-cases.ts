import { useQuery } from '@tanstack/react-query';
import { useCasesApi } from '@/lib/api/use-cases';
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
    queryFn: () => useCasesApi.stories(useCaseId as number),
    enabled: useCaseId != null,
    select: (data) => data.stories ?? [],
    staleTime: 30_000,
  });
}
