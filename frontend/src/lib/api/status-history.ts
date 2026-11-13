import { apiFetch } from './client';
import type { StatusHistoryEntry } from './types';

export const statusHistoryApi = {
  forTc: (tcId: number) =>
    apiFetch<{ history: StatusHistoryEntry[] }>(`/api/status-history/tc/${tcId}`),

  forHallazgo: (id: number) =>
    apiFetch<{ history: StatusHistoryEntry[] }>(`/api/status-history/hallazgo/${id}`),
};
