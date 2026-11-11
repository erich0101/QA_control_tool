import { useQuery } from '@tanstack/react-query';
import { testSuitesApi, usersApi } from '@/lib/api/users';
import { queryKeys } from '@/lib/query-keys';

export function useTestSuites(projectId: number | null, useCaseId?: number) {
  return useQuery({
    queryKey: queryKeys.testSuites(projectId, useCaseId),
    queryFn: () => testSuitesApi.list(projectId as number, useCaseId),
    enabled: projectId != null,
    select: (data) => data.testSuites ?? [],
    staleTime: 30_000,
  });
}

export function useTeam() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: usersApi.list,
    select: (data) => data.users ?? [],
    staleTime: 5 * 60_000,
  });
}
