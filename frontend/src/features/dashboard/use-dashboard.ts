import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/lib/api/stats';
import { queryKeys } from '@/lib/query-keys';

export function useOverviewStats(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.overviewStats(projectId),
    queryFn: () => statsApi.overview(projectId as number),
    enabled: projectId != null,
    staleTime: 60_000,
    retry: false,
  });
}

export function useSuiteStats(projectId: number | null, from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.suiteStats(projectId, from, to),
    queryFn: () => statsApi.suites(projectId as number, from, to),
    enabled: projectId != null,
    select: (data) => data.stats ?? [],
    staleTime: 60_000,
    retry: false,
  });
}

export function useJiraDaily(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.jiraDaily(projectId),
    queryFn: () => statsApi.jiraDaily(projectId as number),
    enabled: projectId != null,
    staleTime: 60_000,
    retry: false,
  });
}

export function useJiraProductivity(projectId: number | null) {
  return useQuery({
    queryKey: queryKeys.jiraProductivity(projectId),
    queryFn: () => statsApi.jiraProductivity(projectId as number),
    enabled: projectId != null,
    staleTime: 60_000,
    retry: false,
  });
}

export function useEpicReport(
  projectId: number | null,
  epicKey: string | null,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: queryKeys.epicReport(projectId, epicKey, from, to),
    queryFn: () => statsApi.epicReport(projectId as number, epicKey as string, from, to),
    enabled: projectId != null && Boolean(epicKey) && Boolean(from) && Boolean(to),
    staleTime: 60_000,
    retry: false,
  });
}
