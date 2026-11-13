import { useQuery } from '@tanstack/react-query';
import { statusHistoryApi } from '@/lib/api/status-history';
import { queryKeys } from '@/lib/query-keys';

/** Histórico de estados de un TC a través de todos sus runs/re-tests. */
export function useTcStatusHistory(tcId: number | null) {
  return useQuery({
    queryKey: queryKeys.tcStatusHistory(tcId),
    queryFn: () => statusHistoryApi.forTc(tcId as number),
    enabled: tcId != null,
    select: (data) => data.history ?? [],
    staleTime: 15_000,
  });
}

/** Histórico de estados de un hallazgo. */
export function useHallazgoStatusHistory(hallazgoId: number | null) {
  return useQuery({
    queryKey: ['hallazgo-status-history', hallazgoId] as const,
    queryFn: () => statusHistoryApi.forHallazgo(hallazgoId as number),
    enabled: hallazgoId != null,
    select: (data) => data.history ?? [],
    staleTime: 15_000,
  });
}
